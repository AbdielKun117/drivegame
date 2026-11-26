# Bachenora

Prototipo 3D de conducción para navegador: cambia de carril para esquivar baches y tráfico y conseguir la mayor distancia posible. Los modelos están construidos con geometrías sencillas en Three.js; no se necesitan modelos de Blender.

## Jugar

Necesitas Node.js y un navegador moderno compatible con WebGL. Desde esta carpeta, ejecuta:

```powershell
npm install
npm run dev
```

Abre la dirección local que muestra Vite. El juego no se ejecuta abriendo `index.html` directamente.

- Pulsa **Jugar** en el menú principal: la escena ocupa toda la ventana del navegador y se adapta al tamaño y orientación del teléfono. No oculta las barras del navegador.
- Usa **Menú** para terminar la partida actual y volver al inicio, o **Menú principal** después de una colisión.
- Computadora: flechas izquierda y derecha.
- Celular: desliza sobre la carretera o toca los botones de dirección.
- La indicación de controles desaparece a los tres segundos de iniciar cada partida; las flechas táctiles siguen disponibles.
- En **Configuración** puedes ocultar los dibujos de los botones laterales (sus zonas táctiles, el teclado y los gestos siguen funcionando) y activar o desactivar música y efectos por separado. Las opciones se guardan en el navegador.
- El récord se guarda en el navegador cuando el almacenamiento local está disponible.
- El recorrido termina al colisionar con un peligro, no por un límite de tiempo. Todas las zonas de choque son un 20 % menores en ancho y largo que antes: rozar los bordes permite seguir jugando, pero los impactos de lleno siguen siendo mortales. El mismo margen se aplica a los carros que rebasan. La pantalla final indica la causa de la colisión.

## Obstáculos y eventos

- Baches irregulares con escombros y variantes con agua; los gigantes abarcan dos carriles.
- Socavones: aparecen grietas antes de que se abra el hueco.
- La zona de choque de socavones y desbordamientos crece junto con su superficie visible; no ocupa el tamaño final mientras apenas se está formando. Los tiempos de aparición y los márgenes preventivos de maniobra de los rebases no cambian.
- Alcantarillas peligrosas: la tapa empieza a tambalearse cerca del carro antes de abrirse o desbordarse. Las alcantarillas que permanecen quietas son seguras y se pueden cruzar.
- Aguas negras: una alcantarilla desborda y el charco se extiende por dos carriles, con salpicaduras.
- El tipo y los carriles se eligen aleatoriamente. No hay avisos de peligro, marcas de ayuda ni indicaciones de carriles libres; debes observar la carretera y reaccionar a sus animaciones.
- Los obstáculos están separados para dejar tiempo de cambiar de carril, incluso a máxima velocidad. Las grietas y tapas cerradas todavía no provocan una colisión.
- La velocidad aumenta con el recorrido hasta alcanzar su límite a los 1,400 metros. La frecuencia de objetos sube progresivamente de uno cada 1.6 segundos a uno cada 0.7 segundos, sin aumentar indefinidamente.
- Los socavones empiezan a agrietarse a menos de un segundo de llegar al carro; las tapas peligrosas comienzan a moverse aproximadamente 1.25 segundos antes. No hay avisos en pantalla.
- **Lluvia:** aparece aleatoriamente, oscurece el cielo y dura entre 10 y 32 segundos según el tiempo de partida. Durante ella aumentan los charcos, los socavones inundados y los desbordamientos. Los charcos sin burbujas son transitables; los que burbujean esconden un bache mortal. También hay carros atrapados que debes esquivar.
- **Carros atrapados:** también aparecen en clima seco, hundidos en baches y echando humo; durante la lluvia se quedan en charcos.
- **Meme de la inundación:** durante algunas lluvias aparece una camioneta negra inundada con un personaje de blusa roja. Al acercarte, gesticula y reproduce al azar uno de los seis audios de voz proporcionados (los tres anteriores y los tres añadidos después). Puede aparecer como máximo una vez por lluvia, ocupa un carril y también debes esquivarla. No se genera al final de una lluvia si no queda tiempo para que llegue mientras llueve.
- **Rebases:** en cualquier clima pueden acercarse carros desde atrás. Su claxon y las luces reflejadas sobre el carril permiten apartarte antes de que pasen. Si desactivas los efectos no sonará el claxon, pero las luces permanecen. Se reserva un carril de escape para evitar bloqueos completos. Los carros intentan esquivar obstáculos visibles sin invadir tu carril mientras pasan; si el peligro está demasiado cerca o no pueden desviarse, chocan y quedan como obstáculos detenidos que echan humo.
- En el 35 % de los rebases suena además una de sus dos voces exclusivas al azar, 1.6 segundos después del claxon para no tapar el aviso. Las seis voces de la señora inundada no se usan en rebases. Las voces pendientes se cancelan al volver al menú, terminar la partida o retirar su vehículo.

## Audio

La música sigue siendo una melodía original sintetizada con Web Audio. La lluvia, el claxon, los choques, el movimiento de tapas y los derrumbes de socavones usan grabaciones locales en `assets/audio`; la lluvia se reproduce como un bucle continuo con entrada y salida gradual. Los golpes de baches y las salpicaduras siguen siendo sintetizados. El audio empieza al pulsar **Jugar**. La música, la lluvia y las voces se detienen al volver al menú o perder (el golpe final sí suena); el audio se suspende cuando ocultas la pestaña. La opción **Efectos de sonido** también controla las grabaciones y las voces.

Los efectos de vehículos y obstáculos siguen su posición con respecto al jugador: lejos suenan bajos, aumentan al acercarse y vuelven a bajar cuando quedan atrás. La variación se suaviza para evitar saltos de volumen. La música y la lluvia ambiental no dependen de un objeto de la carretera. Al retirar un objeto también se cancelan sus sonidos activos o pendientes.

### Fuentes y permisos del audio

- `rain.mp3`: muestra `1.mp3` de [Rain (loopable), Ylmir](https://opengameart.org/content/rain-loopable), [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Grabación real de lluvia, versión MP3 del autor.
- `horn.mp3`: [Car Horn Honk, Elena Teresa (etcd_09)](https://freesound.org/people/etcd_09/sounds/435497/), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Grabación de claxon con Rode NTG3 y H4n, versión MP3 de Freesound sin edición; el crédito también aparece en Configuración.
- `crash.mp3`: [Car Crash, squareal](https://freesound.org/people/squareal/sounds/237375/), [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Foley de impacto metálico y cristales grabados, no un choque de personas filmado.
- `manhole-open.mp3` y `manhole-rattle.mp3`: [Manhole cover (SoundAction 156), alexarje](https://freesound.org/people/alexarje/sounds/863134/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Grabación real de una tapa de alcantarilla desplazándose; apertura de 1.5 segundos desde 2.3 y tambaleo de 0.32 segundos desde 3.21, con entrada y salida gradual. El crédito y la indicación de edición aparecen también en Configuración.
- `collapse.mp3`: [Bricks/Stones/Rocks/Gravel Falling, iwanPlays](https://freesound.org/people/iwanPlays/sounds/567249/), [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Mezcla de grabaciones de piedras y escombros cayendo; versión MP3 de Freesound sin edición.
- `voice-1.mp3`, `voice-2.mp3` y `voice-3.mp3`: copias sin editar de los tres MP3 suministrados en `assets/memes`, en el orden del archivo de las 06:25:06, el archivo de las 06:26:19 terminado en `(1)` y el otro archivo de las 06:26:19. No se les atribuye una licencia libre: antes de publicarlos debes contar con los derechos o permisos necesarios. Los originales y el video permanecen intactos; el video no se incluye en la compilación.
- `voice-4.mp3`, `voice-5.mp3` y `voice-6.mp3`: copias sin editar de las voces añadidas para la señora, en el orden del archivo de las 06:45:43, el archivo de las 06:48:16 terminado en `(1)` y el otro archivo de las 06:48:16. Conservan los mismos requisitos de derechos o permisos de uso.
- `overtake-voice-1.mp3` y `overtake-voice-2.mp3`: copias sin editar de los archivos suministrados de las 06:39:00 y 06:39:57. Solo se usan en rebases, nunca para la señora. Requieren los derechos o permisos de uso correspondientes.

Ejecuta `npm test` para comprobar las colisiones, los eventos y la separación de obstáculos.

Para publicar el juego, ejecuta `npm run build` y publica el contenido de `dist` en un servidor de archivos estáticos. El récord se guarda por navegador y origen, por lo que puede ser diferente entre la versión local y la publicada.

Este prototipo utiliza una carretera inspirada en el desierto; todavía no incluye calles reales ni niveles seleccionables. Para crear escenarios más detallados se pueden añadir modelos GLB propios o de bibliotecas como Kenney, Poly Pizza o Sketchfab; revisa siempre la licencia de cada recurso.

La silueta de Sonora del menú es una versión simplificada del límite estatal de [Natural Earth](https://www.naturalearthdata.com/), cuyos datos son de [dominio público](https://www.naturalearthdata.com/about/terms-of-use/).
