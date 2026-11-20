"""Motor de limpieza conservadora con consenso por magnitud, unidad y timestamp.

Los conflictos nunca se promedian. Los límites y detectores estadísticos solo
marcan observaciones por defecto; no se aprende ni imputa la variable objetivo.
"""

import copy
import csv
import hashlib
import json
import io
import itertools
import platform
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

FLAG_DEFINITIONS = {
    "missing": 1,
    "duplicate": 2,
    "out_of_range": 4,
    "spike": 8,
    "stuck_sensor": 16,
    "time_gap": 32,
    "unit_uncertain": 64,
    "physically_inconsistent": 128,
    "suspected_fault": 256,
    "conflict": 512,
    "imputed": 1024,
    "parse_error": 2048,
    "off_grid": 4096,
}
# Exclusivamente conversiones entre unidades declaradas de la misma magnitud.
UNIT_CONVERSIONS = {
    "A": ("A", 1.0, 0.0),
    "mA": ("A", 0.001, 0.0),
    "V": ("V", 1.0, 0.0),
    "mV": ("V", 0.001, 0.0),
    "W": ("W", 1.0, 0.0),
    "kW": ("W", 1000.0, 0.0),
    "VA": ("VA", 1.0, 0.0),
    "kVA": ("VA", 1000.0, 0.0),
    "var": ("var", 1.0, 0.0),
    "kvar": ("var", 1000.0, 0.0),
    "Wh": ("Wh", 1.0, 0.0),
    "kWh": ("Wh", 1000.0, 0.0),
    "MWh": ("Wh", 1000000.0, 0.0),
    "W/m²": ("W/m²", 1.0, 0.0),
    "kW/m²": ("W/m²", 1000.0, 0.0),
    "Wh/m²": ("Wh/m²", 1.0, 0.0),
    "kWh/m²": ("Wh/m²", 1000.0, 0.0),
    "°C": ("°C", 1.0, 0.0),
    "K": ("°C", 1.0, -273.15),
    "1": ("1", 1.0, 0.0),
    "%": ("%", 1.0, 0.0),
    "kWh/kWp": ("kWh/kWp", 1.0, 0.0),
    "m/s": ("m/s", 1.0, 0.0),
    "Hz": ("Hz", 1.0, 0.0),
}
AUDIT_FIELDS = [
    "source_row",
    "timestamp",
    "column",
    "previous_value",
    "new_value",
    "rule",
    "justification",
]
ISSUE_FIELDS = ["source_row", "timestamp", "column", "flag", "severity", "confidence", "detail"]
REJECT_FIELDS = ["source_row", "rule", "raw_row_json"]
CONFLICT_FIELDS = ["source_row", "timestamp", "column", "source_channel", "value"]


def json_value(value):
    if isinstance(value, (np.integer, np.floating)):
        value = value.item()
    if isinstance(value, (pd.Timestamp, Path)):
        return str(value)
    if value is None or (isinstance(value, float) and not np.isfinite(value)):
        return None
    return value


def write_json(path, payload):
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=json_value, allow_nan=False),
        encoding="utf-8",
    )


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def load_config(path):
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    if config.get("timezone") is not None:
        from zoneinfo import ZoneInfo

        ZoneInfo(config["timezone"])
    if config.get("frequency") is not None and pd.Timedelta(config["frequency"]) <= pd.Timedelta(0):
        raise ValueError("La frecuencia debe ser positiva")
    if config.get("timestamp_position", "unknown") not in ("unknown", "start", "center", "end"):
        raise ValueError("timestamp_position debe ser unknown/start/center/end")
    for rule in config.get("bounds", {}).values():
        if rule.get("action", "flag") not in ("flag", "to_nan"):
            raise ValueError("Acción de límites desconocida")
        if rule.get("min", -np.inf) > rule.get("max", np.inf):
            raise ValueError("Límites mínimo y máximo invertidos")
    for value in config.get("consensus", {}).values():
        if not isinstance(value, (int, float)) or not np.isfinite(value) or value < 0:
            raise ValueError("Las tolerancias de consenso deben ser finitas y no negativas")
    if int(config.get("max_grid_rows", 2000000)) < 1:
        raise ValueError("max_grid_rows debe ser positivo")
    if not config.get("timestamp_formats"):
        raise ValueError("Se requieren formatos temporales explícitos")
    imputation = config.get("imputation", {})
    if imputation.get("enabled") and not imputation.get("columns"):
        raise ValueError("La imputación requiere una lista explícita de columnas")
    if int(imputation.get("max_steps", 2)) < 1:
        raise ValueError("max_steps debe ser positivo")
    for rule in config.get("anomalies", {}).values():
        if not 1 <= rule.get("min_periods", 8) <= rule.get("window", 13):
            raise ValueError("Ventana estadística o min_periods inválidos")
        if rule.get("sigma", 8) <= 0 or rule.get("absolute_floor", 0) < 0:
            raise ValueError("Los umbrales estadísticos deben ser positivos")
    return config


class Audit:
    """Escritura incremental: no acumular millones de eventos en memoria."""

    def __init__(self, output):
        self.handles = []
        self.counts = Counter()
        for name, fields in [
            ("change_log", AUDIT_FIELDS),
            ("ingestion_flags", ISSUE_FIELDS),
            ("rejected_rows", REJECT_FIELDS),
            ("conflicts", CONFLICT_FIELDS),
        ]:
            handle = (output / f"{name}.csv").open("w", encoding="utf-8-sig", newline="")
            self.handles.append(handle)
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            setattr(self, name, writer)

    def change(self, source_row, timestamp, column, before, after, rule, reason):
        self.change_log.writerow(
            dict(
                zip(
                    AUDIT_FIELDS,
                    [
                        source_row,
                        timestamp,
                        column,
                        json_value(before),
                        json_value(after),
                        rule,
                        reason,
                    ],
                )
            )
        )
        self.counts[f"change:{rule}"] += 1

    def issue(
        self,
        source_row,
        timestamp,
        column,
        flag,
        detail,
        confidence="manual_review",
        severity="warning",
    ):
        self.ingestion_flags.writerow(
            dict(
                zip(
                    ISSUE_FIELDS,
                    [source_row, timestamp, column, flag, severity, confidence, detail],
                )
            )
        )
        self.counts[f"issue:{flag}"] += 1

    def reject(self, source_row, row, rule):
        payload = json.dumps([json_value(value) for value in row], ensure_ascii=False, default=str)
        self.rejected_rows.writerow(dict(zip(REJECT_FIELDS, [source_row, rule, payload])))
        self.change(
            source_row,
            "",
            "*",
            payload,
            None,
            rule,
            "Fila conservada en rejected_rows.csv; fuente intacta",
        )
        self.counts[f"rejected:{rule}"] += 1

    def close(self):
        for handle in self.handles:
            handle.close()


@dataclass
class Source:
    data: pd.DataFrame
    origins: pd.Series
    dictionary: list
    manifest: dict


def name_and_unit(header, unit):
    pieces = str(header).strip().split("|", 1)
    variable = pieces[0].strip()
    device = pieces[1].strip() if len(pieces) == 2 else "sin_dispositivo"
    inline = re.search(r"\s*\[([^\]]*)\]\s*$", variable)
    inline_unit = inline.group(1) if inline else ""
    if inline:
        variable = variable[: inline.start()].strip()
    normalize = (
        lambda value: str(value or "")
        .strip()
        .strip("[]")
        .strip()
        .replace("m^2", "m²")
        .replace("m2", "m²")
        .replace("VAr", "var")
        .replace("kVAr", "kvar")
    )
    declared, embedded = normalize(unit), normalize(inline_unit)
    if declared and embedded and declared != embedded:
        raise ValueError(f"Unidades contradictorias en {header}: {declared} / {embedded}")
    return re.sub(r"\s+", " ", variable), device, declared or embedded


def _read_table(path, config, audit, identity):
    """Devuelve encabezados, unidades, filas y números de fila físicos."""
    metadata = {}
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        # No se presupone que siempre haya una fila de unidades ni una sola fila de encabezado.
        frame = pd.read_excel(
            path, header=None, dtype=object, keep_default_na=False, engine="openpyxl", sheet_name=0
        )
        records = list(frame.itertuples(index=False, name=None))
        numbers = list(range(1, len(records) + 1))
        metadata = {"format": "excel", "sheet": 0, "formula_policy": "cached_values"}
    else:
        raw = path.read_bytes()
        encoding = config["csv"].get("encoding", "auto")
        if encoding == "auto":
            if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
                encoding = "utf-16"
            else:
                try:
                    raw.decode("utf-8-sig")
                    encoding = "utf-8-sig"
                except UnicodeDecodeError:
                    encoding = "latin-1"
        text = raw.decode(encoding)
        delimiter = config["csv"].get("delimiter", "auto")
        if delimiter == "auto":
            # Las filas de metadatos o una fila truncada no deben impedir
            # reconocer un encabezado temporal y un delimitador coherente.
            accepted = {value.casefold() for value in config["timestamp_columns"]}
            candidates = []
            for candidate in [";", ",", "\t", "|"]:
                try:
                    sample = list(
                        itertools.islice(
                            csv.reader(io.StringIO(text), delimiter=candidate, strict=True), 40
                        )
                    )
                except csv.Error:
                    continue
                header = next(
                    (
                        i
                        for i, row in enumerate(sample[:30])
                        if len(row) > 1
                        and any(value.strip().casefold() in accepted for value in row)
                    ),
                    None,
                )
                if header is not None:
                    width = len(sample[header])
                    consistency = sum(len(row) == width for row in sample[header + 1 :])
                    candidates.append((consistency, candidate))
            candidates.sort(reverse=True)
            if not candidates or (len(candidates) > 1 and candidates[0][0] == candidates[1][0]):
                raise ValueError(f"{path.name}: delimitador ambiguo; especificar csv.delimiter")
            delimiter = candidates[0][1]
        if len(delimiter) != 1:
            raise ValueError("El delimitador CSV debe tener un carácter")
        reader = csv.reader(io.StringIO(text), delimiter=delimiter, strict=True)
        records, numbers = [], []
        try:
            for row in reader:
                records.append(tuple(row))
                numbers.append(reader.line_num)
        except csv.Error as error:
            raise ValueError(
                f"{path.name}: comillas o estructura CSV inválidas en línea {reader.line_num}"
            ) from error
        metadata = {
            "format": "csv",
            "encoding": encoding,
            "delimiter": delimiter,
            "line_endings": "CRLF" if b"\r\n" in raw else "LF",
            "decimal": config["csv"].get("decimal", "auto"),
        }
    accepted_names = {value.casefold() for value in config["timestamp_columns"]}
    header_index = next(
        (
            i
            for i, row in enumerate(records[:30])
            if any(str(value).strip().casefold() in accepted_names for value in row)
        ),
        None,
    )
    if header_index is None:
        raise ValueError(
            f"{path.name}: no se identificó una columna temporal entre las primeras 30 filas"
        )
    for i in range(header_index):
        audit.reject(f"{identity}:{numbers[i]}", records[i], "metadata_row")
    headers = [str(value or "").strip() for value in records[header_index]]
    time_column = next(i for i, value in enumerate(headers) if value.casefold() in accepted_names)
    body_start = header_index + 1
    units = [""] * len(headers)
    if body_start < len(records):
        row = records[body_start]
        nonempty = [str(value).strip() for value in row if str(value).strip()]
        if nonempty and all(value.startswith("[") and value.endswith("]") for value in nonempty):
            units = list(row) + [""] * max(0, len(headers) - len(row))
            body_start += 1
    body, row_ids = [], []
    for row, physical_row in zip(records[body_start:], numbers[body_start:]):
        row_id = f"{identity}:{physical_row}"
        if len(row) != len(headers):
            audit.reject(row_id, row, "malformed_row")
            continue
        if str(row[time_column]).strip().casefold() in accepted_names:
            audit.reject(row_id, row, "repeated_header")
            continue
        body.append(row)
        row_ids.append(row_id)
    if not body:
        raise ValueError(f"{path.name}: no hay filas de medición")
    metadata.update(
        header_row=numbers[header_index],
        timestamp_column=headers[time_column],
        body_rows=len(records) - body_start,
        parsed_structure_rows=len(body),
        structural_rejections=len(records) - body_start - len(body),
        columns=len(headers),
        units_row=body_start == header_index + 2,
    )
    return headers, units, pd.DataFrame(body), row_ids, time_column, metadata


def parse_timestamps(series, config):
    # Formatos declarados, nunca inferencia ambigua día/mes ni UTC implícito.
    text = series.map(
        lambda value: (
            value.isoformat() if isinstance(value, (pd.Timestamp, datetime)) else str(value).strip()
        )
    )
    parsed = pd.Series(pd.NaT, index=series.index, dtype=object)
    for fmt in config["timestamp_formats"]:
        remaining = parsed.isna()
        if not remaining.any():
            break
        values = pd.to_datetime(text.loc[remaining], format=fmt, errors="coerce")
        parsed.loc[remaining] = values.astype(object)
    valid = parsed.notna()
    values = [pd.Timestamp(value) for value in parsed.loc[valid]]
    zone = config.get("timezone")
    if zone:
        values = [
            (
                value.tz_localize(zone, ambiguous="raise", nonexistent="raise")
                if value.tzinfo is None
                else value.tz_convert(zone)
            )
            for value in values
        ]
    awareness = {str(value.tzinfo) for value in values}
    if len(awareness) > 1:
        raise ValueError("Fechas con zonas/offsets mixtos: declarar timezone antes de consolidar")
    return pd.DatetimeIndex(values), valid


def parse_numeric(series, decimal, thousands, missing_markers, sentinels):
    text = series.map(lambda value: "" if value is None else str(value).strip())
    missing = text.str.casefold().isin(missing_markers)
    prepared = text.copy()
    if thousands:
        prepared = prepared.str.replace(thousands, "", regex=False)
    ambiguous = pd.Series(False, index=series.index)
    if decimal == "auto":
        commas = prepared.str.match(r"^[-+]?\d+,\d+$") & ~missing
        # "1,234" puede ser 1234 o 1.234; no elegir sin contexto de la columna.
        unclear = commas & prepared.str.match(r"^[-+]?\d{1,3},\d{3}$")
        if (commas & ~unclear).any():
            decimal = ","
        else:
            ambiguous = unclear
            decimal = "."
    if decimal not in (".", ","):
        raise ValueError("csv.decimal debe ser auto, punto o coma")
    if decimal == ",":
        prepared = prepared.str.replace(",", ".", regex=False)
    numbers = pd.to_numeric(prepared.mask(missing | ambiguous), errors="coerce").astype(float)
    sentinel_mask = numbers.isin(sentinels)
    invalid = (~missing & ~sentinel_mask) & (numbers.isna() | ~np.isfinite(numbers))
    numbers = numbers.mask(sentinel_mask | ~np.isfinite(numbers))
    return numbers, missing, invalid, sentinel_mask, ambiguous


def load_source(path, config, audit):
    digest = sha256(path)
    identity = f"{path.name}@{digest[:12]}"
    headers, units, raw, row_ids, time_column, metadata = _read_table(path, config, audit, identity)
    index, valid = parse_timestamps(raw.iloc[:, time_column], config)
    for position in np.flatnonzero(~valid.to_numpy()):
        audit.reject(row_ids[position], raw.iloc[position].tolist(), "invalid_timestamp")
    selected = np.flatnonzero(valid.to_numpy())
    raw = raw.loc[valid].reset_index(drop=True)
    row_ids = [row_ids[position] for position in selected]
    if raw.empty:
        raise ValueError(f"{path.name}: todas las fechas son inválidas")
    data, dictionary = {}, []
    markers = {str(value).casefold() for value in config["missing_markers"]}
    for position, header in enumerate(headers):
        if position == time_column:
            continue
        column = raw.iloc[:, position]
        if not header and column.map(lambda value: value is None or str(value).strip() == "").all():
            audit.change(
                f"{identity}:header:{position + 1}",
                "",
                f"column_{position + 1}",
                "",
                None,
                "empty_column",
                "Columna sin encabezado y sin observaciones; no contiene mediciones",
            )
            continue
        header = header or f"unnamed_column_{position + 1}"
        name, device, declared = name_and_unit(header, units[position])
        configured_unit = config.get("units", {}).get(header, config.get("units", {}).get(name, ""))
        if configured_unit and declared and name_and_unit(name, configured_unit)[2] != declared:
            raise ValueError(
                f"{path.name}: la unidad configurada contradice la unidad declarada de {header}"
            )
        declared = declared or name_and_unit(name, configured_unit)[2]
        normalized, factor, offset = UNIT_CONVERSIONS.get(
            declared, (declared or "unknown", 1.0, 0.0)
        )
        if name == "Factor de potencia" and declared == "%":
            normalized, factor = "1", 0.01
        channel = f"{name} | {device} [{normalized}]"
        # Columnas repetidas en el mismo archivo también deben conservar su identidad.
        if channel in data:
            channel += f" (columna {position + 1})"
        numbers, missing, invalid, sentinel, ambiguous = parse_numeric(
            column,
            config["csv"].get("decimal", "auto") if metadata["format"] == "csv" else ".",
            config["csv"].get("thousands") if metadata["format"] == "csv" else None,
            markers,
            config.get("numeric_sentinels", {}).get(name, []),
        )
        for row in np.flatnonzero((invalid | sentinel).to_numpy()):
            rule = (
                "declared_sentinel"
                if sentinel.iloc[row]
                else "ambiguous_number" if ambiguous.iloc[row] else "invalid_numeric"
            )
            audit.change(
                row_ids[row],
                index[row],
                header,
                column.iloc[row],
                None,
                rule,
                "Solo sentinelas configurados o texto/no finitos imposibles de interpretar de forma segura",
            )
            audit.issue(
                row_ids[row],
                index[row],
                header,
                "parse_error" if invalid.iloc[row] else "missing",
                rule,
                confidence="confirmed" if rule != "ambiguous_number" else "manual_review",
            )
        with np.errstate(over="ignore", invalid="ignore"):
            values = numbers * factor + offset
        overflow = numbers.notna() & ~np.isfinite(values)
        for row in np.flatnonzero(overflow.to_numpy()):
            audit.change(
                row_ids[row],
                index[row],
                header,
                column.iloc[row],
                None,
                "normalization_overflow",
                "Desbordamiento durante la conversión de unidades",
            )
            audit.issue(
                row_ids[row],
                index[row],
                header,
                "parse_error",
                "normalization_overflow",
                confidence="confirmed",
            )
        values = values.mask(overflow)
        changed_unit = values.notna() & numbers.notna() & ((factor != 1) | (offset != 0))
        for row in np.flatnonzero(changed_unit.to_numpy()):
            audit.change(
                row_ids[row],
                index[row],
                header,
                numbers.iloc[row],
                values.iloc[row],
                "unit_conversion",
                f"{declared} -> {normalized}; factor={factor}, offset={offset}",
            )
        data[channel] = values.to_numpy()
        dictionary.append(
            {
                "source_file": path.name,
                "source_sha256": digest,
                "source_column": position + 1,
                "original_name": header,
                "variable": name,
                "device": device,
                "original_unit": declared or "unknown",
                "normalized_unit": normalized,
                "factor": factor,
                "offset": offset,
                "channel": channel,
                "observed_values": int(numbers.notna().sum()),
                "missing_markers": int(missing.sum()),
                "parse_errors": int(invalid.sum()),
                "sentinels": int(sentinel.sum()),
                "normalization_overflow": int(overflow.sum()),
                "quantity": (
                    "irradiance"
                    if normalized == "W/m²"
                    else "irradiation" if normalized == "Wh/m²" else normalized
                ),
                "energy_semantics": (
                    "unconfirmed_counter_or_interval" if normalized == "Wh" else "not_applicable"
                ),
                "unit_status": "declared" if declared in UNIT_CONVERSIONS else "review_required",
            }
        )
    if not data:
        raise ValueError(f"{path.name}: no contiene columnas de medición")
    frame = pd.DataFrame(data, index=index)
    origins = pd.Series(row_ids, index=index, name="source_row")
    return Source(
        frame,
        origins,
        dictionary,
        {
            "path": str(path.resolve()),
            "sha256": digest,
            "bytes": path.stat().st_size,
            "accepted_rows": len(frame),
            "invalid_timestamps": int((~valid).sum()),
            "out_of_order_rows": int((frame.index.to_series().diff() < pd.Timedelta(0)).sum()),
            "first_timestamp": frame.index.min().isoformat(),
            "last_timestamp": frame.index.max().isoformat(),
            **metadata,
        },
    )


def resolve_consensus(combined, origins, dictionary, config, audit):
    channel_meta = {row["channel"]: row for row in dictionary}
    groups = defaultdict(list)
    channels_by_name = defaultdict(set)
    for channel, row in channel_meta.items():
        groups[(row["variable"], row["normalized_unit"], channel)].append(channel)
        channels_by_name[row["variable"]].add(channel)
    timestamps = combined.index.unique().sort_values()
    clean = {}
    flags = {}
    output_map = {}
    conflicts_count = 0
    tolerance = config["consensus"]
    channel_to_output = {}
    for (name, unit, identity), channels in groups.items():
        output_column = name if len(channels_by_name[name]) == 1 else identity
        channel_to_output[identity] = output_column
        parts = []
        for channel in channels:
            present = combined[channel].notna().to_numpy()
            parts.append(
                pd.DataFrame(
                    {
                        "timestamp": combined.index[present],
                        "value": combined[channel].to_numpy()[present],
                        "source_row": origins.to_numpy()[present],
                        "channel": channel,
                    }
                )
            )
        candidates = pd.concat(parts, ignore_index=True)
        consensus = candidates.groupby("timestamp", sort=True)["value"].agg(
            ["first", "min", "max", "count"]
        )
        conflict = (consensus["max"] - consensus["min"]) > (
            tolerance["absolute_tolerance"]
            + tolerance["relative_tolerance"]
            * np.maximum(consensus["min"].abs(), consensus["max"].abs())
        )
        resolved = consensus["first"].mask(conflict).reindex(timestamps)
        clean[output_column] = resolved
        bits = pd.Series(np.uint16(0), index=timestamps)
        duplicate_times = timestamps.intersection(
            combined.index[combined.index.duplicated(keep=False)].unique()
        )
        bits.loc[duplicate_times] |= FLAG_DEFINITIONS["duplicate"]
        conflicting_times = consensus.index[conflict]
        bits.loc[conflicting_times] |= FLAG_DEFINITIONS["conflict"]
        conflicts_count += len(conflicting_times)
        rejected = candidates.loc[candidates["timestamp"].isin(conflicting_times)]
        for row in rejected.itertuples(index=False):
            audit.conflicts.writerow(
                dict(
                    zip(
                        CONFLICT_FIELDS,
                        [row.source_row, row.timestamp, output_column, row.channel, row.value],
                    )
                )
            )
            audit.change(
                row.source_row,
                row.timestamp,
                output_column,
                row.value,
                None,
                "conflict_unresolved",
                "Fuentes discordantes: no promediar ni elegir un dispositivo sin evidencia",
            )
        if unit not in {value[0] for value in UNIT_CONVERSIONS.values()} or name == "Digital 2":
            bits.loc[resolved.notna()] |= FLAG_DEFINITIONS["unit_uncertain"]
        flags[output_column] = bits
        output_map[output_column] = {"variable": name, "unit": unit, "channels": channels}
    clean = pd.DataFrame(clean, index=timestamps)
    flags = pd.DataFrame(flags, index=timestamps)
    clean.index.name = flags.index.name = "Fecha y hora"
    for row in dictionary:
        row["output_column"] = channel_to_output[row["channel"]]
        row["resolution_rule"] = (
            "Consenso entre archivos del mismo canal; equipos diferentes permanecen separados. Conflicto: NaN y candidatos en conflicts.csv"
        )
    return clean, flags.astype("uint16"), output_map, conflicts_count


def regularize(clean, flags, config):
    timestamps = clean.index
    differences = pd.Series(timestamps[1:] - timestamps[:-1])
    modal = differences.mode().iloc[0] if len(differences) else None
    frequency = pd.Timedelta(config["frequency"]) if config.get("frequency") else None
    # Inferir solo cuando el modo tiene evidencia suficiente; registrar la decisión.
    inferred = False
    if frequency is None and modal is not None and (differences == modal).mean() >= 0.8:
        frequency, inferred = modal, True
    inserted = pd.DatetimeIndex([], tz=timestamps.tz)
    off_grid = pd.DatetimeIndex([], tz=timestamps.tz)
    if frequency is not None:
        estimated_size = (timestamps[-1] - timestamps[0]) // frequency + 1
        if estimated_size > config.get("max_grid_rows", 2000000):
            raise ValueError(
                f"La grilla requeriría {estimated_size:,} filas; revisar frecuencia, fechas o max_grid_rows"
            )
        grid = pd.date_range(timestamps[0], timestamps[-1], freq=frequency)
        inserted, off_grid = grid.difference(timestamps), timestamps.difference(grid)
        index = grid.union(timestamps).sort_values()
        clean = clean.reindex(index)
        flags = flags.reindex(index, fill_value=0).astype("uint16")
        flags.loc[inserted, :] |= FLAG_DEFINITIONS["time_gap"]
        flags.loc[off_grid, :] |= FLAG_DEFINITIONS["off_grid"]
    return (
        clean,
        flags,
        inserted,
        off_grid,
        {
            "frequency": str(frequency) if frequency is not None else None,
            "frequency_inferred": inferred,
            "modal_observed_step": str(modal) if modal is not None else None,
            "fraction_modal_step": (
                float((differences == modal).mean()) if modal is not None else None
            ),
            "irregular_steps": (
                int((differences != frequency).sum()) if frequency is not None else None
            ),
        },
    )


def apply_quality_rules(clean, flags, output_map, config, audit):
    before = clean.copy()
    changes = pd.DataFrame(False, index=clean.index, columns=clean.columns)
    for column in clean.columns:
        variable = output_map[column]["variable"]
        values = clean[column]
        rule = config.get("bounds", {}).get(variable)
        if rule and rule.get("unit") == output_map[column]["unit"]:
            bad = values.lt(rule.get("min", -np.inf)) | values.gt(rule.get("max", np.inf))
            flags.loc[bad, column] |= FLAG_DEFINITIONS["out_of_range"]
            for timestamp, value in values.loc[bad].items():
                audit.issue(
                    "resolved",
                    timestamp,
                    column,
                    "out_of_range",
                    rule["reason"],
                    confidence=rule.get("confidence", "manual_review"),
                )
                if rule.get("action", "flag") == "to_nan":
                    audit.change(
                        "resolved",
                        timestamp,
                        column,
                        value,
                        None,
                        "configured_bound_to_nan",
                        rule["reason"],
                    )
            if rule.get("action", "flag") == "to_nan":
                clean.loc[bad, column] = np.nan
                changes.loc[bad, column] = True
        # Temperatura por debajo del cero absoluto: inconsistencia confirmada, se conserva y marca.
        if output_map[column]["unit"] == "°C":
            bad = values.lt(-273.15)
            flags.loc[bad, column] |= FLAG_DEFINITIONS["physically_inconsistent"]
        detector = config.get("anomalies", {}).get(variable)
        if detector and output_map[column]["unit"] == "°C":
            window = detector.get("window", 13)
            history = values.shift(1).rolling(window, min_periods=detector.get("min_periods", 8))
            median = history.median()
            # IQR robusto y causal: no se ajusta ningún filtro aprendido sobre prueba.
            scale = (history.quantile(0.75) - history.quantile(0.25)) / 1.349
            threshold = (scale * detector.get("sigma", 8)).clip(
                lower=detector.get("absolute_floor", 0)
            )
            spike = values.notna() & median.notna() & (values - median).abs().gt(threshold)
            flags.loc[spike, column] |= FLAG_DEFINITIONS["spike"]
            same = values.notna() & values.eq(values.shift())
            # Un hueco de reloj rompe la racha aunque dos valores vecinos coincidan.
            if config.get("frequency"):
                same &= pd.Series(
                    clean.index.to_series().diff().eq(pd.Timedelta(config["frequency"])).to_numpy(),
                    index=clean.index,
                )
            groups = (~same).cumsum()
            elapsed = clean.index.to_series() - clean.index.to_series().groupby(groups).transform(
                "min"
            )
            stuck = values.notna() & elapsed.ge(
                pd.Timedelta(minutes=detector.get("stuck_minutes", 360))
            )
            flags.loc[stuck, column] |= FLAG_DEFINITIONS["stuck_sensor"]
            for flag, mask in [("spike", spike), ("stuck_sensor", stuck)]:
                for timestamp in clean.index[mask]:
                    audit.issue(
                        "resolved",
                        timestamp,
                        column,
                        flag,
                        "Indicador estadístico causal; cuantización, estabilidad natural o cambios reales también pueden producirlo",
                        confidence="manual_review",
                        severity="info",
                    )
    flags = pd.DataFrame(
        flags.to_numpy(dtype="uint16") | clean.isna().to_numpy(dtype="uint16"),
        index=flags.index,
        columns=flags.columns,
    )
    return before, clean, flags.astype("uint16"), changes


def visualization_imputation(clean, flags, output_map, config, audit):
    settings = config.get("imputation", {})
    if not settings.get("enabled"):
        return None, None
    if not config.get("frequency"):
        raise ValueError("La imputación requiere frecuencia nominal explícita")
    result, imputed_flags = clean.copy(), flags.copy()
    step = pd.Timedelta(config["frequency"])
    for column in settings["columns"]:
        if column not in result:
            raise ValueError(f"Columna de imputación desconocida: {column}")
        # No se habilita interpolación de energía, meteorología o variables sin semántica verificada.
        if (
            output_map[column]["unit"] not in ("A", "V", "W", "VA", "var", "1")
            or output_map[column]["variable"] == "Digital 2"
        ):
            raise ValueError(
                f"No se permite interpolar {column}; solo magnitudes eléctricas instantáneas identificadas"
            )
        series = result[column]
        missing = series.isna()
        groups = missing.ne(missing.shift()).cumsum()
        lengths = missing.groupby(groups).transform("sum")
        previous, following = series.ffill(), series.bfill()
        blocked = flags[column] & ~np.uint16(
            FLAG_DEFINITIONS["missing"]
            | FLAG_DEFINITIONS["time_gap"]
            | FLAG_DEFINITIONS["duplicate"]
        )
        # Extremos y todo el hueco sin otras banderas; nunca atravesar un conflicto o límite físico.
        problematic = blocked.gt(0)
        group_blocked = problematic.groupby(groups).transform("any")
        endpoint_bad = problematic.where(series.notna()).ffill().fillna(True).astype(
            bool
        ) | problematic.where(series.notna()).bfill().fillna(True).astype(bool)
        timestamps = clean.index.to_series()
        previous_time = timestamps.where(series.notna()).ffill()
        next_time = timestamps.where(series.notna()).bfill()
        eligible = (
            missing
            & lengths.le(settings.get("max_steps", 2))
            & previous.notna()
            & following.notna()
            & ~group_blocked
            & ~endpoint_bad
            & (next_time - previous_time).eq((lengths + 1) * step)
        )
        interpolation = series.interpolate(method="time", limit_area="inside")
        result.loc[eligible, column] = interpolation.loc[eligible]
        imputed_flags.loc[eligible, column] |= FLAG_DEFINITIONS["imputed"]
        for timestamp in series.index[eligible]:
            audit.change(
                "resolved",
                timestamp,
                column,
                None,
                result.at[timestamp, column],
                "visualization_imputation",
                "Interpolación no causal solo para visualizar; no usar como target ni evaluar modelos",
            )
    return result, imputed_flags


def gap_summary(clean, frequency):
    records = []
    for column in clean:
        missing = clean[column].isna()
        groups = missing.ne(missing.shift()).cumsum()
        selected = clean.index.to_series().loc[missing]
        for _, group in selected.groupby(groups.loc[missing]):
            records.append(
                {
                    "column": column,
                    "start": group.iloc[0],
                    "end": group.iloc[-1],
                    "steps": len(group),
                    "duration_minutes": (
                        float(len(group) * frequency.total_seconds() / 60) if frequency else None
                    ),
                }
            )
    return pd.DataFrame(records, columns=["column", "start", "end", "steps", "duration_minutes"])


def comparison_plots(raw, clean, flags, output_map, output, config):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    candidates = [
        name
        for name in ["Producción fotovoltaica", "Irradiación", "Temperatura ambiente"]
        if name in clean
    ]
    if not candidates:
        candidates = list(clean.columns[:3])
    figure, axes = plt.subplots(
        len(candidates), 1, figsize=(13, 3.4 * len(candidates)), squeeze=False
    )
    conflict_count = ((flags[candidates] & FLAG_DEFINITIONS["conflict"]) != 0).sum(axis=1)
    daily_conflicts = conflict_count.groupby(conflict_count.index.normalize()).sum()
    if daily_conflicts.max() > 0:
        start = max(clean.index.min(), daily_conflicts.idxmax() - pd.Timedelta(days=3))
    else:
        start = clean.index.max() - pd.Timedelta(days=7)
    end = min(clean.index.max(), start + pd.Timedelta(days=7))
    for axis, column in zip(axes[:, 0], candidates):
        for channel in output_map[column]["channels"]:
            values = raw.loc[(raw.index >= start) & (raw.index <= end), channel].dropna()
            if len(values):
                axis.scatter(values.index, values, s=3, alpha=0.3, label=channel)
        values = clean.loc[(clean.index >= start) & (clean.index <= end), column]
        axis.plot(
            values.index,
            values,
            linewidth=1,
            color="#15374e",
            label="Consenso depurado (sin imputar)",
        )
        display_name = (
            "Irradiancia (columna original: Irradiación)"
            if column == "Irradiación" and output_map[column]["unit"] == "W/m²"
            else column
        )
        axis.set(
            title=f"{display_name} · {start.date()} a {end.date()}",
            ylabel=output_map[column]["unit"],
        )
        axis.grid(alpha=0.2)
        axis.legend(fontsize=6, loc="upper left")
    axes[-1, 0].set_xlabel(
        "Fecha y hora registradas; zona: " + (config.get("timezone") or "sin confirmar")
    )
    figure.suptitle(
        "Valores originales por canal frente a datos depurados; huecos preservados", fontsize=12
    )
    figure.autofmt_xdate()
    figure.tight_layout()
    figure.savefig(output / "comparison.png", dpi=160)
    plt.close(figure)


def write_outputs(
    clean, flags, before, dictionary, output_map, sources, report, output, raw, config
):
    clean.attrs.update(
        cleaning_version=3,
        timezone=config.get("timezone"),
        timestamp_position=config.get("timestamp_position", "unknown"),
        target_imputed=False,
        quality_flags_file="quality_flags.csv",
        source_manifest_file="source_manifest.json",
    )
    clean.to_csv(output / "cleaned.csv", encoding="utf-8-sig")
    clean.to_pickle(output / "cleaned.pkl")
    flags.to_csv(output / "quality_flags.csv", encoding="utf-8-sig")
    write_json(
        output / "quality_flag_definitions.json",
        {
            "encoding": "Máscara de bits independiente por celda; usar (valor & bit) != 0. Cero = ninguna bandera registrada, no garantía de exactitud.",
            "flags": FLAG_DEFINITIONS,
            "confidence": {
                "spike": "manual_review",
                "stuck_sensor": "manual_review",
                "conflict": "confirmed_disagreement",
            },
            "missing": "La bandera persiste en la salida imputada para conservar la procedencia.",
        },
    )
    pd.DataFrame(dictionary).to_csv(
        output / "data_dictionary.csv", index=False, encoding="utf-8-sig"
    )
    stats = []
    for stage, frame in [("before_rules", before), ("after_rules", clean)]:
        for column in frame:
            values = frame[column]
            stats.append(
                {
                    "stage": stage,
                    "column": column,
                    "unit": output_map[column]["unit"],
                    "count": int(values.count()),
                    "missing_pct": float(values.isna().mean() * 100),
                    "min": values.min(),
                    "p25": values.quantile(0.25),
                    "median": values.median(),
                    "p75": values.quantile(0.75),
                    "max": values.max(),
                    "mean": values.mean(),
                    "std": values.std(),
                }
            )
    pd.DataFrame(stats).to_csv(
        output / "statistics_before_after.csv", index=False, encoding="utf-8-sig"
    )
    missing = clean.isna()
    by_month = missing.groupby(clean.index.strftime("%Y-%m")).mean().mul(100)
    by_month.index.name = "month"
    by_month.to_csv(output / "missing_by_month.csv", encoding="utf-8-sig")
    by_hour = missing.groupby(clean.index.hour).mean().mul(100)
    by_hour.index.name = "hour_as_recorded"
    by_hour.to_csv(output / "missing_by_hour.csv", encoding="utf-8-sig")
    frequency = pd.Timedelta(report["frequency"]) if report["frequency"] else None
    gaps = gap_summary(clean, frequency)
    gaps.to_csv(output / "gaps.csv", index=False, encoding="utf-8-sig")
    quality = []
    for column in clean:
        counts = {
            name: int(((flags[column] & bit) != 0).sum()) for name, bit in FLAG_DEFINITIONS.items()
        }
        quality.append(
            {
                "column": column,
                "rows": len(clean),
                "observed": int(clean[column].notna().sum()),
                "missing_pct": float(clean[column].isna().mean() * 100),
                **counts,
            }
        )
    pd.DataFrame(quality).to_csv(output / "quality_summary.csv", index=False, encoding="utf-8-sig")
    report["quality_by_column"] = quality
    report["gaps"] = {"runs": len(gaps), "max_steps": int(gaps["steps"].max()) if len(gaps) else 0}
    if config.get("plots", True):
        comparison_plots(raw, clean, flags, output_map, output, config)
    write_json(output / "summary.json", report)
    source_list = "\n".join(
        f"- `{Path(item.manifest['path']).name}`: {item.manifest['accepted_rows']:,} filas aceptadas; SHA-256 `{item.manifest['sha256']}`."
        for item in sources
    )
    table = "\n".join(
        f"| {item['column']} | {item['observed']:,} | {item['missing_pct']:.2f}% | {item['conflict']:,} | {item['out_of_range']:,} |"
        for item in quality
    )
    warnings = "\n".join(f"- {warning}" for warning in report["warnings"])
    markdown = f"""# Informe de limpieza fotovoltaica

Estado: completado. Fuentes originales y dataset activo del proyecto sin sobrescribir.

## Fuentes verificadas

{source_list}

## Tiempo, estructura y cobertura

- Filas de entrada: {report['input_rows']:,}; aceptadas con fecha: {report['accepted_input_rows']:,}.
- Timestamps observados únicos: {report['observed_timestamps']:,}; salida: {len(clean):,}.
- Frecuencia: {report['frequency']}; inferida: {report['frequency_inferred']}.
- Zona horaria declarada: {config.get('timezone') or 'no declarada; fechas conservadas sin localizar'}.
- Posición de la marca temporal: {config.get('timestamp_position', 'unknown')}.
- Registros exactos repetidos: {report['exact_duplicate_rows']:,}; registros adicionales con timestamp repetido: {report['repeated_timestamp_rows']:,}.
- Timestamps insertados: {report['inserted_timestamps']:,}; fuera de grilla preservados: {report['off_grid_timestamps']:,}.
- Filas fuera de orden de origen: {sum(item.manifest['out_of_order_rows'] for item in sources):,}; orden cronológico en la salida.
- Cobertura de timestamps observados sobre la unión temporal: {report['timestamp_coverage_pct']:.2f}% (no equivale a disponibilidad física de la planta).
- Celdas con conflicto no resuelto: {report['conflict_cells']:,}.
- Celdas modificadas por límites explícitos: {report['rule_modified_cells']:,} en {report['rule_modified_rows']:,} filas; valores imputados en cleaned.csv: 0.
- Filas con alguna bandera: {report['flagged_rows']:,}; las banderas incluyen ausencias y redundancia, no solo errores.
- Celdas marcadas: {report['flagged_cells']:,} de {clean.size:,} ({report['flagged_cells'] / clean.size * 100:.2f}%).

## Decisiones y trazabilidad

1. Los canales conservan dispositivo y unidad. Solo se consolidan observaciones de un mismo canal (variable, dispositivo y unidad normalizada). Equipos distintos permanecen en columnas separadas aunque coincidan sus valores.
2. Si los candidatos discrepan, la celda canónica queda ausente; `conflicts.csv` conserva todos los valores con archivo SHA-256 y fila. No se promedian sensores ni timestamps conflictivos.
3. `change_log.csv` registra conversiones, rechazos, consolidaciones, huecos y correcciones. Cada fila de fuente se identifica como nombre@hash:fila física. Para eventos `resolved`, el timestamp/columna y el manifiesto permiten recuperar los candidatos originales.
4. Los marcadores de ausencia se interpretan durante la ingesta, no son valores medidos corregidos. Sus conteos están en el diccionario y los huecos finales en quality_flags.csv. Los sentinelas numéricos solo se aplican si se configuran explícitamente.
5. Las banderas son bits independientes, definidos en quality_flag_definitions.json; pueden coexistir. Una sospecha estadística requiere revisión manual y no confirma una falla.
6. Los límites físicos y los detectores estadísticos son los de `config_used.json`. Los detectores usan historia previa y no modifican valores. No hay escaladores ni filtros aprendidos antes de dividir los datos.
7. No se interpola energía, no se derivan incrementos de contadores sin semántica confirmada y no se genera model_ready.csv sin un encargo específico de preparación predictiva.
8. No se elimina batería, columnas constantes ni señales digitales por suponer que carecen de utilidad. Las columnas realmente vacías se documentan; las filas rechazadas conservan su contenido.

## Calidad por variable

| Variable | Observaciones | Faltantes | Conflictos | Fuera de rango |
|---|---:|---:|---:|---:|
{table}

Los porcentajes por mes/hora están en missing_by_month.csv y missing_by_hour.csv; las duraciones de huecos en gaps.csv; las distribuciones antes/después en statistics_before_after.csv. Los conteos y rangos originales por canal están en diagnostic.json y data_dictionary.csv. {'La comparación gráfica está en comparison.png.' if config.get('plots', True) else 'Gráficos omitidos mediante configuración.'}

## Advertencias y siguientes pasos

{warnings}

- Confirmar zona horaria, convención temporal, geometría y ubicación antes de calcular posición solar o etiquetar día/noche.
- Confirmar si cada energía en Wh es incremento de intervalo o contador acumulado antes de integrar o diferenciar.
- Resolver conflictos con inventario y calibración de equipos, no con promedios arbitrarios.
- Antes de entrenar, establecer exclusiones por bandera, dividir cronológicamente y ajustar transformaciones solo con entrenamiento. No usar interpolaciones para visualización en evaluación de modelos.
- La salida nueva no sustituye automáticamente datos activos, modelos, reportes anteriores ni Supabase.
"""
    (output / "cleaning_report.md").write_text(markdown, encoding="utf-8")


def run_pipeline(inputs, output, config):
    config = copy.deepcopy(config)
    files = set()
    for entry in map(Path, inputs):
        if entry.is_dir():
            files.update(
                path.resolve()
                for path in entry.iterdir()
                if path.suffix.lower() in (".csv", ".xlsx", ".xlsm")
                and not path.name.startswith("~$")
            )
        elif entry.is_file() and entry.suffix.lower() in (".csv", ".xlsx", ".xlsm"):
            files.add(entry.resolve())
        else:
            raise FileNotFoundError(f"Entrada no válida: {entry}")
    if not files:
        raise FileNotFoundError("No se encontraron archivos CSV/XLSX/XLSM")
    output = Path(output).resolve()
    # Evitar que una siguiente ejecución vuelva a ingerir sus propias salidas.
    if any(output == file.parent or file.is_relative_to(output) for file in files):
        raise ValueError("La salida debe estar separada de los archivos fuente")
    output.mkdir(parents=True, exist_ok=False)
    audit = Audit(output)
    implementation = {
        path.name: sha256(path)
        for path in [Path(__file__), Path(__file__).resolve().parents[1] / "procesos/limpiar_consolidar.py"]
    }
    try:
        write_json(output / "config_used.json", config)
        sources = []
        for file in sorted(files):
            print(f"Leyendo y verificando: {file.name}", flush=True)
            sources.append(load_source(file, config, audit))
        zones = {str(source.data.index.tz) for source in sources}
        if len(zones) != 1:
            raise ValueError(
                "Fuentes con zonas horarias diferentes: especificar timezone para consolidarlas"
            )
        combined = pd.concat([source.data for source in sources])
        origins = pd.concat([source.origins for source in sources])
        dictionary = [row for source in sources for row in source.dictionary]
        write_json(output / "source_manifest.json", [source.manifest for source in sources])
        # Diagnóstico persistido ANTES de aplicar consolidación o reglas de tratamiento.
        diagnostic = {"files": [source.manifest for source in sources], "channel_statistics": []}
        for channel in combined:
            values = combined[channel]
            diagnostic["channel_statistics"].append(
                {
                    "channel": channel,
                    "count": int(values.count()),
                    "missing_pct": float(values.isna().mean() * 100),
                    "min": json_value(values.min()),
                    "max": json_value(values.max()),
                    "median": json_value(values.median()),
                }
            )
        write_json(output / "diagnostic.json", diagnostic)
        (output / "cleaning_plan.md").write_text(
            """# Plan previo de limpieza

- Parsear solo formatos temporales declarados; conservar filas rechazadas y orden de origen por referencia.
- Conservar unidades y dispositivos; convertir solo unidades explícitas compatibles.
- Mantener equipos en columnas separadas; consolidar por consenso solo archivos del mismo canal y preservar conflictos.
- Construir grilla nominal sin eliminar fechas fuera de ella; identificar huecos insertados.
- Aplicar límites y detectores configurados; marcar sospechas sin sustituir mediciones por defecto.
- Guardar observados, banderas, diccionario, auditoría, distribuciones, huecos y reporte.
- Conservar zona horaria y semántica de contadores como no confirmadas si falta evidencia.
- Imputación desactivada por defecto. Si se solicita, salida exclusiva para visualización.
""",
            encoding="utf-8",
        )
        print("Diagnóstico guardado; consolidando canales sin promedios...", flush=True)
        repeated = combined.index.duplicated(keep="first")
        exact = combined.assign(__timestamp=combined.index).duplicated(keep="first")
        for position in np.flatnonzero(repeated):
            audit.change(
                origins.iloc[position],
                combined.index[position],
                "*",
                "additional_source_record",
                "consensus_candidates",
                "exact_duplicate" if exact.iloc[position] else "repeated_timestamp",
                "Todos los candidatos quedan referenciados; solo se reduce redundancia cuando los valores concuerdan",
            )
        clean, flags, output_map, conflicts = resolve_consensus(
            combined, origins, dictionary, config, audit
        )
        observed_count = len(clean)
        clean, flags, inserted, off_grid, time_report = regularize(clean, flags, config)
        for timestamp in inserted:
            audit.change(
                "grid",
                timestamp,
                "*",
                None,
                "row_of_missing_values",
                "insert_time_gap",
                "Timestamp nominal ausente; se inserta sin inventar mediciones",
            )
        for timestamp in off_grid:
            audit.issue(
                "resolved",
                timestamp,
                "*",
                "off_grid",
                "Fecha fuera de grilla preservada; no se redondea",
            )
        before, clean, flags, rule_changes = apply_quality_rules(
            clean, flags, output_map, config, audit
        )
        imputed, imputed_flags = visualization_imputation(clean, flags, output_map, config, audit)
        if imputed is not None:
            imputed.to_csv(output / "visualization_imputed.csv", encoding="utf-8-sig")
            imputed_flags.to_csv(output / "visualization_quality_flags.csv", encoding="utf-8-sig")
        warnings = []
        if not config.get("timezone"):
            warnings.append(
                "No se ha declarado zona horaria: no se localizan ni desplazan fechas ingenuas. La hora de los informes es la registrada."
            )
        if config.get("timestamp_position", "unknown") == "unknown":
            warnings.append(
                "Inicio/centro/fin del intervalo sin confirmar: no se realinean sensores ni se calculan integrales."
            )
        warnings.extend(
            [
                "No hay ubicación, inclinación ni capacidad instalada confirmadas en esta configuración. No se inventan límites de potencia ni geometría solar.",
                "Una unidad Wh no demuestra si la señal es energía de intervalo o un contador. Los reinicios no se convierten automáticamente en consumo negativo.",
                "Irradiación con W/m² es irradiancia; se conserva el nombre legado para compatibilidad y se documenta quantity=irradiance.",
                "Los umbrales estadísticos de temperatura son heurísticos configurables; la cuantización o estabilidad natural también pueden generar banderas.",
                "Digital 2 cambia de unidad entre archivos; sus variantes se mantienen separadas y requieren diccionario del fabricante.",
            ]
        )
        for source in sources:
            if source.manifest.get("encoding") == "latin-1":
                warnings.append(
                    f"{Path(source.manifest['path']).name}: decodificación latin-1 de respaldo; verificar caracteres y metadatos."
                )
            if sha256(Path(source.manifest["path"])) != source.manifest["sha256"]:
                raise RuntimeError(
                    "Una fuente cambió durante la ejecución; se conserva la salida parcial para diagnóstico"
                )
        report = {
            "cleaning_version": 3,
            "status": "complete",
            "implementation_sha256": implementation,
            "versions": {
                "python": platform.python_version(),
                "pandas": pd.__version__,
                "numpy": np.__version__,
            },
            "input_rows": sum(source.manifest["body_rows"] for source in sources),
            "accepted_input_rows": len(combined),
            "observed_timestamps": observed_count,
            "output_rows": len(clean),
            "output_columns": len(clean.columns),
            "exact_duplicate_rows": int(exact.sum()),
            "repeated_timestamp_rows": int(repeated.sum()),
            "inserted_timestamps": len(inserted),
            "off_grid_timestamps": len(off_grid),
            "timestamp_coverage_pct": observed_count / len(clean) * 100,
            "conflict_cells": conflicts,
            "rule_modified_cells": int(rule_changes.to_numpy().sum()),
            "rule_modified_rows": int(rule_changes.any(axis=1).sum()),
            "flagged_rows": int(flags.ne(0).any(axis=1).sum()),
            "imputed_observed_cells": 0,
            "flagged_cells": int(flags.ne(0).to_numpy().sum()),
            "audit_counts": dict(audit.counts),
            "warnings": warnings,
            **time_report,
        }
        print("Guardando datos, banderas, auditoría y reporte...", flush=True)
        write_outputs(
            clean, flags, before, dictionary, output_map, sources, report, output, combined, config
        )
        return report
    except Exception as error:
        write_json(
            output / "failure.json",
            {"status": "incomplete", "error": str(error), "audit_counts": dict(audit.counts)},
        )
        raise
    finally:
        audit.close()
