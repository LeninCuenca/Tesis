ALTER TABLE centrales ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE variables_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE mediciones_energeticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumen_diario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dashboard puede leer centrales" ON centrales;
CREATE POLICY "Dashboard puede leer centrales"
    ON centrales FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Dashboard puede leer equipos" ON equipos;
CREATE POLICY "Dashboard puede leer equipos"
    ON equipos FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Dashboard puede leer variables" ON variables_catalogo;
CREATE POLICY "Dashboard puede leer variables"
    ON variables_catalogo FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Dashboard puede leer mediciones" ON mediciones_energeticas;
CREATE POLICY "Dashboard puede leer mediciones"
    ON mediciones_energeticas FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Dashboard puede leer resumen diario" ON resumen_diario;
CREATE POLICY "Dashboard puede leer resumen diario"
    ON resumen_diario FOR SELECT TO anon, authenticated USING (true);
