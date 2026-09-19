# B1 canonical durable payload

`b1-canonical-r2.csv.bz2.base64` is the durable text encoding of the exact compressed canonical B1 input recovered from the ADR-042 diagnostic source commit `67d45fe0ff18832650d2da6c8df8fb69ba68fbcd`.

Recovery: Base64-decode, bzip2-decompress, then require SHA-256 `d4e3dbc39b347d23829a7bdba2880daf48626c715580dfde1ee844b8555633ac` and 1189 data rows before reuse. This removes dependence on conversation attachments and expiring CI artifacts.
