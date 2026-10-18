# Ejemplos

Descarga el archivo si lo estás viendo en GitHub y ábrelo desde **Abrir** en DaLogic Light. Desde una copia local, selecciónalo directamente en esta carpeta. Los `.dalogic` también se pueden arrastrar al tablero.

| Archivo | Qué prueba | Resultado esperado |
| --- | --- | --- |
| [puerta-and.dalogic](puerta-and.dalogic) | Dos interruptores, AND y bombilla | La salida solo se activa con A=1 y B=1 |
| [semisumador.dalogic](semisumador.dalogic) | XOR y AND con dos salidas | S=A XOR B; Cout=A AND B |
| [multiplexor.dalogic](multiplexor.dalogic) | CI MUX 2 a 1 incluido | Y=D0 con SEL=0; Y=D1 con SEL=1 |
| [semisumador.dmodule](semisumador.dmodule) | Importación de un CI combinacional | Entradas A/B, salidas S/Cout |

Para el módulo, usa **Herramientas → Importar CI .dmodule** y colócalo desde la biblioteca. Todos los ejemplos usan señales de un bit y carecen de memoria o retardos.
