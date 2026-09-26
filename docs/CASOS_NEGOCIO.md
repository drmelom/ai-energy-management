# Los cuatro casos, explicados desde el negocio

Guía para la demo y la entrevista. Cada caso responde a la pregunta que hace un operador de red: **¿qué está pasando, es real, y qué hago?**

## Contexto: qué mide un medidor y por qué importan las cuatro variables

Un medidor industrial entrega cada hora cuatro números:

| Variable | Qué es | Qué le dice al operador |
|---|---|---|
| **Consumo (kWh)** | Energía usada en la hora | Lo que se factura. Su forma diaria (valle de noche, pico de día) es la "firma" del cliente. |
| **Tensión (V)** | Voltaje que entrega la red, nominal 220 V | Es responsabilidad de la eléctrica. Debe estar dentro de ±5 %. Fuera de banda daña equipos del cliente y expone a la empresa a reclamos. |
| **Corriente (A)** | Cuánta carga está conectada | Sube y baja con el consumo. Si el consumo sube y la corriente no, el dato miente. |
| **Factor de potencia (PF)** | Eficiencia con la que el cliente usa la energía (1,0 = perfecto) | Bajo 0,90 la empresa suele penalizar en factura; bajo 0,80 indica motores o cargas mal compensadas y sobrecarga la red. |

Las cuatro están ligadas por física: **energía ≈ tensión × corriente × PF**. Si esa relación se rompe hora a hora, el problema no está en el cliente sino en el medidor o en la comunicación.

**Baseline**: la primera semana del dataset es el comportamiento "normal" de cada medidor, hora a hora. Todo lo que se compara es contra esa semana.

---

## M-109 · Anomalía real · Severidad alta · Prioridad 1

**Qué se ve.** Desde el viernes 12/09 a las 14:00 el consumo salta a más del doble de su baseline (+110 %) y se queda ahí 58 horas, hasta el final del periodo. No es un pico: es un nuevo nivel.

**Por qué es real y no un error de medida.** La corriente también se duplica, exactamente en la misma proporción. Un medidor roto no produce dos variables coherentes entre sí. Además el factor de potencia cae de 0,94 a 0,74 de forma limpia y sostenida: entró una carga grande y mal compensada, típico de motores o compresores conectados sin corrección.

**Por qué es preocupante.** Nadie lo reportó. El único registro para este medidor ese día es un evento de tipo `UNKNOWN` con la nota "No operational event reported". En el gráfico aparece como una bandera en el borde exacto del cambio: el sistema lo muestra para que se vea que **se buscó una explicación y no la hay**. Un aumento así sin aviso puede ser una carga no declarada (fraude o ampliación sin contrato), un equipo averiado consumiendo de más, o una conexión irregular.

**Qué recomienda la IA.** Enviar un técnico a verificar la instalación y las cargas conectadas. Es la única anomalía donde la acción es ir a campo, por eso va primera.

**Frase para la demo:** "Consumo al doble, corriente al doble, factor de potencia por el suelo y ningún evento que lo explique. Esto es lo que un operador quiere ver primero cuando entra en la mañana."

---

## M-112 · Calidad de dato · Severidad alta · Prioridad 2

**Qué se ve.** El consumo es completamente normal: +0,1 % frente a su baseline, la línea azul nunca sale de la banda. Pero desde el sábado 13/09 a las 00:00 las lecturas eléctricas se vuelven un diente de sierra: cada tres horas la tensión salta 12 a 25 V (entre 201 y 241 V), el PF cae hasta 0,58, y a la hora siguiente todo vuelve a la normalidad.

**Por qué es un problema de medida y no de consumo.** Una red real no oscila 40 V y vuelve cada tres horas; un cliente real no cambia su PF de 0,95 a 0,58 y de vuelta en una hora. Y la prueba definitiva: la relación energía ≈ V × I × PF se rompe y **cambia de signo** hora a hora (de -73 % a +76 %). Eso es físicamente imposible. El medidor, su transformador de medida o el enlace de comunicaciones están fallando.

**Por qué es alta prioridad aunque el consumo esté bien.** Con ese medidor se factura. Si se emite la factura con lecturas corruptas, hay reclamo del cliente y pérdida de confianza. Además, sin lecturas fiables no se puede detectar nada más en ese punto de la red.

**Qué recomienda la IA.** Revisar el medidor y sus comunicaciones, y poner en cuarentena las lecturas del periodo antes de facturar. La acción es de mantenimiento y facturación, no de inspección al cliente.

**Frase para la demo:** "Aquí el consumo no tiene nada raro. Lo que está roto es el instrumento. Si el sistema solo mirara kWh, este caso pasaría desapercibido y se facturaría con datos basura."

---

## M-104 · Anomalía explicable · Severidad media · Sin prioridad

**Qué se ve.** El jueves 11/09 a las 00:00 el consumo sube un 46 % y se mantiene los cuatro días restantes. La corriente sube en la misma proporción. Tensión y PF no cambian.

**Por qué es explicable.** El mismo 11/09 a las 00:00 hay un evento registrado: `OPERATIONAL_CHANGE`, "New production line activated". Coincide al minuto con el inicio del cambio. El cliente puso en marcha una línea de producción nueva, y las variables eléctricas dicen que lo hizo bien: la carga nueva está compensada, no distorsiona la red.

**Por qué es severidad media y no baja.** El cambio es legítimo pero **permanente**. Eso obliga a la eléctrica a hacer algo, aunque no sea urgente: el baseline de ese cliente ya no sirve, la potencia contratada puede haberse quedado corta, y el contrato puede requerir revisión. Ignorarlo generaría falsas alarmas cada día a partir de ahora.

**Qué recomienda la IA.** Actualizar el baseline del medidor y revisar contrato y potencia. Nada de campo.

**Frase para la demo:** "Sube casi la mitad, pero hay un evento que lo explica exactamente. La IA no lo esconde, lo reclasifica: no es un problema, es un cambio de negocio que requiere trámite."

---

## M-106 · Falso positivo · Severidad baja · Sin prioridad

**Qué se ve.** El lunes 08/09 el consumo cae un 80 % entre las 00:00 y las 11:00, doce horas exactas, y a las 12:00 vuelve a la normalidad. En el balance de los 14 días el medidor queda en +1 %.

**Por qué es falso positivo.** Hay un evento `SCHEDULED_OUTAGE` registrado ese día: "Scheduled maintenance outage for 12 hours". Empieza a la misma hora y la duración observada coincide con la declarada. La corriente cae al 19 %, coherente con una planta parada, y tensión y PF siguen normales: la red no tuvo ningún problema, el cliente simplemente apagó.

**Por qué importa detectarlo bien.** Un detector ingenuo dispararía una alerta crítica por una caída del 80 %. Si el sistema hiciera eso, el operador perdería confianza en las alertas a la tercera parada programada. Que el sistema diga "esto no requiere nada" es tan valioso como que detecte M-109.

**Qué recomienda la IA.** Cerrar sin acción y registrarlo como parada planificada.

**Frase para la demo:** "El sistema vio la caída, la cruzó con el calendario de mantenimiento y concluyó que no hay nada que investigar. Eso ahorra un despacho de técnico."

---

## Los otros ocho medidores

Ninguno aparece en anomalías, y eso también es un resultado: sus desvíos diarios están entre -1,2 % y +1,3 %, su tensión entre 216 y 225 V, su PF por encima de 0,86. El peor de ellos queda a mitad de camino de cualquier umbral de detección. Cero falsos positivos.

---

## Cómo se prioriza (el ranking del dashboard)

1. Primero lo que **requiere investigación** (prioridad): M-109 y M-112.
2. Dentro de ellos, por severidad y luego por tipo: una anomalía real va antes que un problema de medida.
3. Después lo que requiere trámite (M-104) y por último lo que no requiere nada (M-106).

El resultado, "4 anomalías detectadas, 2 requieren atención prioritaria", es lo que el enunciado pide como ejemplo final.

## Sobre la confianza

La confianza no se inventa ni se deriva: es una cuarta pregunta que se le hace al modelo, independiente de las otras tres: "¿qué tan concluyente es la evidencia para clasificar, graduar y priorizar este caso?", con tres niveles (no concluyente, parcial, concluyente). Resultado: M-106 98 %, M-104 91 %, M-112 90 % y M-109 61 %. Que la anomalía más grave tenga la confianza más baja es una lectura valiosa: el modelo está seguro de que es real y alta, pero señala que falta información clave, nadie reportó qué pasó ese día. Eso es justo lo que la acción recomendada manda a averiguar.
