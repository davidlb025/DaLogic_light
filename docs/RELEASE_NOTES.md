# DaLogic Light 1.0.0

Primera distribución de DaLogic Light, la edición web de DaLogic para diseñar y probar circuitos combinacionales directamente en el navegador.

## Incluye

- Puertas AND, OR, XOR, NOT, NAND y NOR; interruptores, pulsadores, constantes, bombillas y visores de un bit.
- Biblioteca de 8 CI combinacionales e importación/creación de módulos `.dmodule`.
- Editor con selección múltiple, copiar/cortar/pegar, duplicar, alinear, rejilla, zoom y deshacer/rehacer.
- Diagnóstico de conexiones, tablas de verdad y descarga CSV.
- Exportación del circuito PNG/SVG, proyectos `.dalogic`, copia local y temas claro/oscuro.
- Ejemplos y documentación en español.

## Descargas

- **DaLogic-Light-1.0.0-web.zip**: aplicación preparada para abrir `index.html` después de extraer el ZIP completo o servir los archivos en un alojamiento estático. Incluye ejemplos, documentación y licencia.
- **DaLogic-Light-1.0.0-source.zip**: fuentes completas con herramientas y workflows de publicación.
- **SHA256SUMS.txt**: huellas SHA-256 de ambos ZIP.

No necesitas Python ni Node.js para utilizar la aplicación. Las herramientas de preparación requieren Node.js 22 o posterior.

## Alcance de Light

Simulación combinacional, un bit por puerto, hasta 2.000 componentes y 8.000 cables. Las tablas admiten hasta 8 entradas, 256 combinaciones y 8.192 celdas. Los proyectos deben respetar el subconjunto de formatos compatible con Light; buses, memoria, temporización y realimentación requieren DaLogic completo.

Descarga tus proyectos y módulos para conservarlos: la copia del navegador puede perderse al borrar los datos del sitio o cambiar de origen.

Creado por David Lopez Borrego. Licencia Apache 2.0; se conservan LICENSE y NOTICE.
