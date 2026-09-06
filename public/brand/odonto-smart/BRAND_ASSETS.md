# Odonto Smart asset provenance

Copied 2026-09-05 from the read-only brand repository:
`/home/miguel/projects/portfolio/ODONTO-SMART`.

The PNG logo files were copied byte-for-byte. Artwork was not recolored,
resized, recompressed or otherwise mutated. The selected clinic photo is from
the source's documented `fotos-reales` set and contains no visible patient
identity; it is reserved for a future login/onboarding decision, not the FE0
operational screens. FE1A uses the existing minimum set; no additional asset
was copied.

| Source | Destination | Purpose | SHA-256 |
| --- | --- | --- | --- |
| `public/images/odonto-smart/logo-horizontal-marca-premium.png` | `logos/logo-horizontal-marca-premium.png` | desktop sidebar/topbar lockup; transparent safe variant | `b23e811d4065c46aad6579caa5718c81662df6baf395f84d5f0d870d7e79f549` |
| `public/images/odonto-smart/logo-principal.png` | `logos/logo-principal.png` | compact operational identity; transparent safe variant | `3368b1f6379a0c84df01835223e84ce3420183461eff63b707dd798cdcb27519` |
| `public/images/odonto-smart/logo-circular-emblema-marca.png` | `logos/logo-circular-emblema-marca.png` | mobile/compact shell emblem | `3aa29ba84d87a85dae50e75b4df3da4ea908f309513af23dbc5180b58d4f5236` |
| `logo-oficial/logo-principal-odontosmart.png` | `logos/logo-principal-odontosmart.png` | high-resolution compact official artwork | `dd689fd718b9e2a4679c9175fe7ab59ed7a09f5dd29dd66099865d446baf7b24` |
| `logo-oficial/logo-banner-oficial.png` | `logos/logo-banner-oficial.png` | high-resolution horizontal/banner artwork | `31830be74a30f752d3921f510f1b6ef23f4643f7c7192759116b1407e774dd7a` |
| `public/images/odonto-smart/fotos-reales/consultorio-dental-1.jpg` | `clinic/consultorio-dental-1.jpg` | selected real-clinic image for future login/onboarding | `5a6d07fcf9c8a7735f2b47d0af0dd1dca6a5878e74ee4a28b5a2cc8d2f201926` |

## Deliberate exclusions

- `public/images/odonto-smart/logo-vectorial-oficial.svg` is excluded because
  the source design guide documents its opaque white-canvas trap on dark
  surfaces; the validated PNG/RGBA variants are safer for FE0.
- No `Zone.Identifier`, source documentation, app code, `node_modules`,
  `.next`, environment files, credentials, patient data or obsolete V1 assets
  were copied.
- No other real-clinic or patient-facing image was copied before a future
  authorization/use decision.
