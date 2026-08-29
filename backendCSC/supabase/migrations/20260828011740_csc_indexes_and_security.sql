-- Index the referencing side of foreign keys, reusing existing covering indexes.
DO $indexes$
DECLARE c record; cols text;
BEGIN
  FOR c IN SELECT conrelid, conkey, conname FROM pg_constraint
    WHERE contype='f' AND connamespace='csc'::regnamespace
    ORDER BY cardinality(conkey) DESC, conname
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indisvalid
      AND i.indpred IS NULL AND (i.indkey::smallint[])[0:cardinality(c.conkey)-1] @> c.conkey
    ) THEN
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord) INTO cols
      FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum;
      EXECUTE format('CREATE INDEX %I ON %s (%s)',
        'fk_' || left(c.conname, 40) || '_' || left(md5(c.conname),8), c.conrelid::regclass, cols);
    END IF;
  END LOOP;
END
$indexes$;

-- Existing project event trigger: keep its DDL behavior, remove public RPC grants.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
