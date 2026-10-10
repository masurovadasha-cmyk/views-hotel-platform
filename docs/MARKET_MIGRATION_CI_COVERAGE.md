# VIEWS Stage 7 — migration CI coverage fix

Previous Production Core CI workflow stopped applying migrations at 0034, so its successful status **did not validate** V-Market migrations 0035–0037. The workflow now applies 0035, 0036 and 0037 and asserts all six market tables exist with both ENABLE and FORCE RLS. It also fails if any INSERT, UPDATE, DELETE or ALL policy has been added to these tables prematurely.

This is a CI coverage fix only. No production deployment, public order endpoint, transactional reservation engine or real payment is enabled. If the new workflow fails, resolve the schema failure before merging.
