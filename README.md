# LinkVault + Google Apps Script

## Qué hace

Este proyecto mantiene LinkVault como aplicación estática y usa el mismo tipo de conexión que tu proyecto QR Edificio: GitHub Pages/Live Server -> Google Apps Script -> Google Drive.

No hay botón de OAuth ni ventana de "Conectar con Google".

Cuando cargas un `.txt`:
1. LinkVault extrae las URLs y mantiene la lista local.
2. Envía el TXT original a Apps Script.
3. Apps Script guarda el original en `Mi unidad/LinkVault - TXT cargados`.
4. Apps Script crea o actualiza `Mi unidad/LinkVault - URLs generadas/URLs_YYYY-MM-DD.txt` con todas las URLs actuales.

## Configuración

1. Abre tu proyecto de Google Apps Script que usa el QR Edificio.
2. Haz una copia de seguridad de su `Code.gs`.
3. Reemplaza `Code.gs` por el `Code.gs` incluido aquí. Este archivo conserva la lógica QR y agrega LinkVault.
4. Implementa/actualiza como Aplicación web:
   - Ejecutar como: tú
   - Quién tiene acceso: cualquier persona que deba usar la página (por ejemplo, cualquiera con el enlace).
5. Copia la URL `/exec` de la implementación.
6. Abre `config.js` y reemplaza:
   `PEGA_AQUI_LA_URL_DE_TU_GOOGLE_APPS_SCRIPT`
   por la URL real.
7. Sube el proyecto a GitHub Pages o usa Live Server.

## Estructura de Drive

Mi unidad/
├── LinkVault - URLs generadas/
│   └── URLs_YYYY-MM-DD.txt
└── LinkVault - TXT cargados/
    ├── archivo1.txt
    ├── archivo2.txt
    └── ...

Los archivos con el mismo nombre no se sobrescriben; se les agrega fecha/hora.

## Importante

El enlace `https://drive.google.com/drive/u/0/my-drive` es la vista de Mi unidad, no una carpeta que deba pegarse en el código. Apps Script crea las dos carpetas directamente dentro de Mi unidad.
