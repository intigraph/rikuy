# Working on Rikuy

Rikuy is a static browser client over Quipu. Use Node 22 or newer and `just ci`.
Keep the same bounded, read-only transports; render missing evidence as UNKNOWN.
Production query registration, read-cost approval, signing enrollment and activation are separate from source delivery. Keep experimental readers disabled by default.
Never commit credentials, operator data, snapshots, inventories or private deployment configuration.
Run browser checks with synthetic data and block nonlocal requests. Do not launch a production query to test a UI edit.
The stack table comes from the canonical Tambo table and must remain byte-identical across repositories.
