# LinkVault - Google Drive

Proyecto preparado para GitHub Pages / Live Server.

## Estructura de Google Drive

Mi unidad/
├── LinkVault - URLs generadas/
│   └── URLs_YYYY-MM-DD.txt
└── LinkVault - TXT cargados/
    ├── archivo1.txt
    ├── archivo2.txt
    └── ...

## Google OAuth

Client ID configurado:

835700336258-m3unj2ptlv0o7ndhn0eqkj7ljslf42p6.apps.googleusercontent.com

Orígenes autorizados habituales:
- http://localhost:5501
- https://macv2605.github.io

En Google Cloud Console:
1. Habilita Google Drive API.
2. Configura el OAuth Client ID como aplicación web.
3. Agrega los orígenes autorizados correspondientes.
4. Prueba mediante http://localhost:5501 o GitHub Pages; no abras index.html con file://.

## Nota

El proyecto conserva el procesamiento local de TXT y las URLs.
