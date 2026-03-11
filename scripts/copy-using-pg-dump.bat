@echo off
echo Installing PostgreSQL client tools...
choco install postgresql --version=16.0.0 -y

echo.
echo Dumping from source database...
set SOURCE=postgresql://admin:SQgKTxNyCQWC7YxvaRQXqjAvIozS3Fci@dpg-d117rc15pdvs73emkj30-a.singapore-postgres.render.com/bdb_cecs
set DEST=postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm

"C:\Program Files\PostgreSQL\16\bin\pg_dump" --schema=public --no-owner --no-acl "%SOURCE%" > public_schema.sql

echo.
echo Restoring to destination database...
"C:\Program Files\PostgreSQL\16\bin\psql" "%DEST%" -f public_schema.sql

echo.
echo Done!
pause
