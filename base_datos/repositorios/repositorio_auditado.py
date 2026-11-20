"""Repositorio SQLite versionado para conservar todos los canales auditados.

Las fechas ingenuas se guardan como texto de reloj; no se inventa un UTC.
Cada archivo es una instantánea de una central, con clave central y fecha.
"""
from pathlib import Path
import hashlib
import json
import os
import sqlite3
import tempfile
from contextlib import closing
import numpy as np
import pandas as pd


def write_snapshot(frame, destination, *, central_id, source_sha256, provenance):
    destination = Path(destination)
    if not isinstance(central_id, int) or isinstance(central_id, bool) or central_id <= 0:
        raise ValueError('central_id debe ser entero positivo')
    if not isinstance(frame.index, pd.DatetimeIndex) or frame.index.hasnans or frame.index.has_duplicates:
        raise ValueError('Se requiere un índice temporal válido y único')
    if not frame.columns.is_unique or not len(frame.columns):
        raise ValueError('Los canales deben ser únicos y no vacíos')
    frame = frame.sort_index()
    numeric = frame.apply(pd.to_numeric, errors='raise')
    if np.isinf(numeric.to_numpy(dtype=float)).any():
        raise ValueError('No se admiten infinitos')
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='snapshot-', suffix='.sqlite', dir=destination.parent)
    os.close(fd)
    codes = [f'c{i:03d}' for i in range(len(frame.columns))]
    try:
        with closing(sqlite3.connect(temporary)) as connection, connection:
            connection.execute('CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            connection.execute('CREATE TABLE channels (code TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL)')
            connection.executemany('INSERT INTO channels VALUES (?,?)', zip(codes, map(str, frame.columns)))
            connection.execute('CREATE TABLE measurements (central_id INTEGER NOT NULL, recorded_at TEXT NOT NULL, '
                               + ', '.join(f'{c} REAL' for c in codes)
                               + ', PRIMARY KEY(central_id,recorded_at)) WITHOUT ROWID')
            statement = 'INSERT INTO measurements VALUES (' + ','.join(['?'] * (len(codes)+2)) + ')'
            # Bound memory to a batch; preserve every NaN as SQL NULL.
            for start in range(0, len(frame), 2000):
                block = numeric.iloc[start:start+2000]
                rows = ((central_id, moment.isoformat(),
                         *(None if pd.isna(v) else float(v) for v in values))
                        for moment, values in zip(block.index, block.itertuples(index=False, name=None)))
                connection.executemany(statement, rows)
            metadata = dict(provenance, central_id=central_id, source_sha256=source_sha256,
                            rows=len(frame), channels=len(codes),
                            clock_convention='unshifted_source_clock' if frame.index.tz is None else str(frame.index.tz))
            connection.executemany('INSERT INTO metadata VALUES (?,?)',
                                   ((k, json.dumps(v, ensure_ascii=False, allow_nan=False)) for k,v in metadata.items()))
            assert connection.execute('SELECT COUNT(*) FROM measurements').fetchone()[0] == len(frame)
            assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        # Verify semantic equality of values, including all NULL positions.
        with closing(sqlite3.connect(temporary)) as connection:
            for start in range(0,len(frame),2000):
                read = connection.execute('SELECT '+','.join(codes)+' FROM measurements WHERE central_id=? ORDER BY recorded_at LIMIT ? OFFSET ?',
                                          (central_id,2000,start)).fetchall()
                np.testing.assert_allclose(np.asarray(read,dtype=float), numeric.iloc[start:start+2000].to_numpy(dtype=float),
                                           rtol=0,atol=0,equal_nan=True)
        os.replace(temporary,destination)
    finally:
        if os.path.exists(temporary):os.unlink(temporary)
    return dict(metadata, database_sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                integrity='ok', roundtrip='all_values_and_nulls_exact')
