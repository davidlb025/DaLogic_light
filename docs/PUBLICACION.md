# Crear y subir DaLogic Light a GitHub

El paquete está preparado para un repositorio llamado **DaLogic-Light**, bajo **davidlb025**, tomando como referencia la autoría y el enlace del proyecto original. Es una propuesta de nombre, no un repositorio creado. Si eliges otro propietario o nombre, adapta los comandos y la URL de Pages de esta guía; los workflows utilizan el repositorio en el que se ejecutan y no necesitan ese nombre fijo.

## 1. Revisar el paquete local

Desde la raíz de la carpeta DaLogic Light, con Node.js 22 o posterior:

```powershell
npm run check
npm run package
```

No se necesita `npm install`: las herramientas usan únicamente módulos integrados de Node.js. La aplicación se utiliza abriendo `index.html`; Node.js solo es necesario para estas comprobaciones y paquetes.

Resultados para la versión inicial:

```text
dist/site/
dist/DaLogic-Light-1.0.0-web.zip
dist/DaLogic-Light-1.0.0-source.zip
dist/SHA256SUMS.txt
```

Abre `dist/site/index.html`. Comprueba los interruptores del ejemplo AND, la tabla de verdad, guardar/reabrir un proyecto, importar el módulo de ejemplo y exportar PNG/SVG. `check` valida sintaxis, enlaces y ejemplos; no automatiza todas las interacciones del navegador.

## 2. Crear el repositorio

En [GitHub → New repository](https://github.com/new):

| Campo | Valor propuesto |
| --- | --- |
| Owner | davidlb025 |
| Repository name | DaLogic-Light |
| Description | Editor y simulador ligero de circuitos lógicos combinacionales en el navegador. Sin instalación ni dependencias de ejecución. |
| Visibility | Public, si quieres distribuirlo públicamente |
| Inicialización | No añadir README, licencia ni .gitignore: ya están preparados |

Topics propuestos: `digital-logic`, `logic-gates`, `circuit-simulator`, `education`, `javascript`, `html5-canvas`, `static-site`.

Elige la visibilidad que quieras antes de crear el repositorio. GitHub Pages está disponible en repositorios públicos con GitHub Free; la disponibilidad para repositorios privados depende del plan.

## 3. Subir el código

Abre una terminal en la raíz de **DaLogic Light**, no en la carpeta del DaLogic de escritorio. Para una carpeta que todavía no tiene repositorio Git:

```powershell
git init -b main
git add .
git status --short
git commit -m "Prepare DaLogic Light 1.0.0"
git remote add origin https://github.com/davidlb025/DaLogic-Light.git
git push -u origin main
```

Antes del commit, revisa `git status`: deben aparecer las fuentes, documentación, ejemplos, scripts y `.github/`; `dist/`, entornos, archivos `.env` y credenciales quedan excluidos. El `.gitignore` no excluye todos los posibles proyectos personales: incluye solo los ejemplos que quieras compartir.

Si la carpeta ya tiene `.git`, revisa primero `git status`, `git branch --show-current` y `git remote -v`. Reutiliza el repositorio y remoto correctos; no vuelvas a ejecutar la inicialización ni reemplaces un remoto a ciegas. Los comandos anteriores se deben adaptar si ya existe historial o un remoto.

Git pedirá autenticación si hace falta. Utiliza el gestor de credenciales de GitHub o tu método habitual; no escribas tokens en archivos del proyecto.

No subas los ZIP de `dist/` al código: se adjuntan a la Release. Subir por Git conserva `.github/` y los archivos que empiezan por punto.

## 4. Activar GitHub Pages

1. En el repositorio, entra en **Settings → Pages → Build and deployment**.
2. Elige **GitHub Actions** como fuente.
3. En **Actions**, ejecuta manualmente **Publicar GitHub Pages** sobre `main` si el primer push ocurrió antes de activar Pages.
4. Comprueba que el flujo termine correctamente. En adelante, los pushes a `main` lo ejecutan automáticamente.
5. Copia la dirección que muestre el despliegue y añádela al campo **Website** de About.

Con el nombre propuesto y sin dominio personalizado, la URL prevista es `https://davidlb025.github.io/DaLogic-Light/`. Será válida cuando hayas creado el repositorio y completado el primer despliegue. Puedes añadir entonces un enlace «Abrir aplicación» al README.

El workflow verifica el paquete, genera `dist/site/` y publica únicamente ese directorio. No necesita secretos personales. La configuración inicial de Pages y las reglas del entorno `github-pages` deben permitir el despliegue desde `main`.

## 5. Preparar la primera Release

La versión inicial propuesta es `1.0.0`, definida en `package.json`. Revisa [las notas](RELEASE_NOTES.md) y el [historial](../CHANGELOG.md) antes de etiquetar.

Después de subir `main`, crea y sube la etiqueta:

```powershell
git tag -a v1.0.0 -m "DaLogic Light 1.0.0"
git push origin v1.0.0
```

**Preparar Release** comprueba que la etiqueta coincide con `package.json`, verifica los archivos, genera los dos ZIP y crea una **Release en borrador** con `SHA256SUMS.txt` y las notas. Usa el `GITHUB_TOKEN` del workflow con permiso `contents: write`; no hace falta añadir un token personal. La organización o el repositorio pueden aplicar restricciones adicionales a Actions.

En **Releases**, abre el borrador, revisa las notas y descarga/prueba el ZIP web. Pulsa **Publish release** cuando quieras hacerlo público. Subir una etiqueta hace público ese punto del código en un repositorio público aunque la Release siga en borrador. La publicación de la web es independiente y sigue los pushes a `main`.

Si prefieres una Release manual, crea un borrador desde Releases, utiliza la etiqueta de la versión y adjunta los tres archivos generados en `dist/`. Si el flujo ya creó el borrador, edítalo en lugar de crear otro.

Para verificar un ZIP en Windows:

```powershell
Get-FileHash .\dist\DaLogic-Light-1.0.0-web.zip -Algorithm SHA256
```

Compara la huella con la línea del mismo nombre en `SHA256SUMS.txt`.

## 6. Versiones posteriores

Actualiza `version` en `package.json`, añade una entrada en `CHANGELOG.md` y sustituye `docs/RELEASE_NOTES.md` por las notas de esa versión. Si el README menciona un número concreto, actualízalo también. Ejecuta `npm run package`, revisa la web, sube los cambios y crea una etiqueta `vX.Y.Z` que coincida con la versión. Los nombres de los paquetes se calculan automáticamente.

## Archivos preparados

| Archivo o carpeta | Función |
| --- | --- |
| README.md, CHANGELOG.md, CONTRIBUTING.md | Presentación, historial y colaboración |
| LICENSE, NOTICE | Licencia original y atribución de Light y DaLogic |
| .gitignore, .gitattributes, .editorconfig | Exclusiones y formato del repositorio |
| package.json y scripts/ | Comprobación, directorio web y ZIP con SHA-256 |
| examples/ | Tres circuitos y un módulo reutilizable |
| .github/workflows/ci.yml | Verificación en pushes y pull requests |
| .github/workflows/pages.yml | Despliegue del sitio desde main |
| .github/workflows/release.yml | Release en borrador al subir vX.Y.Z |
| .github/ISSUE_TEMPLATE/ y pull_request_template.md | Incidencias y contribuciones |

## Referencias oficiales

- [Configurar la fuente de publicación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
- [Usar workflows personalizados con GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
- [Crear una Release con GitHub CLI](https://cli.github.com/manual/gh_release_create).

Esta preparación no crea el repositorio remoto, no sube código y no activa Pages por sí sola.
