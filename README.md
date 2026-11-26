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
- El recorrido termina al tocar un bache o un carro, no por un límite de tiempo. La pantalla final indica la causa de la colisión.

## Obstáculos y eventos

- Baches irregulares con escombros y variantes con agua; los gigantes abarcan dos carriles.
- Socavones: aparecen grietas antes de que se abra el hueco.
- Alcantarillas peligrosas: la tapa empieza a tambalearse cerca del carro antes de abrirse o desbordarse. Las alcantarillas que permanecen quietas son seguras y se pueden cruzar.
- Aguas negras: una alcantarilla desborda y el charco se extiende por dos carriles, con salpicaduras.
- El tipo y los carriles se eligen aleatoriamente. No hay avisos de peligro, marcas de ayuda ni indicaciones de carriles libres; debes observar la carretera y reaccionar a sus animaciones.
- Los obstáculos están separados para dejar tiempo de cambiar de carril, incluso a máxima velocidad. Las grietas y tapas cerradas todavía no provocan una colisión.
- La velocidad aumenta con el recorrido hasta alcanzar su límite a los 1,400 metros. La frecuencia de objetos sube progresivamente de uno cada 1.6 segundos a uno cada 0.7 segundos, sin aumentar indefinidamente.
- Los socavones empiezan a agrietarse a menos de un segundo de llegar al carro; las tapas peligrosas comienzan a moverse aproximadamente 1.25 segundos antes. No hay avisos en pantalla.
- **Lluvia:** aparece aleatoriamente, oscurece el cielo y dura entre 10 y 32 segundos según el tiempo de partida. Durante ella aumentan los charcos, los socavones inundados y los desbordamientos. Los charcos sin burbujas son transitables; los que burbujean esconden un bache mortal. También hay carros atrapados que debes esquivar.
- **Carros atrapados:** también aparecen en clima seco, hundidos en baches y echando humo; durante la lluvia se quedan en charcos.
- **Rebases:** en cualquier clima pueden acercarse carros desde atrás. Su claxon y las luces reflejadas sobre el carril permiten apartarte antes de que pasen. Si desactivas los efectos no sonará el claxon, pero las luces permanecen. Se reserva un carril de escape para evitar bloqueos completos. Los carros intentan esquivar obstáculos visibles sin invadir tu carril mientras pasan; si el peligro está demasiado cerca o no pueden desviarse, chocan y quedan como obstáculos detenidos que echan humo.

## Audio

La música es una melodía original sintetizada con Web Audio; los sonidos de asfalto roto, tapas, agua, lluvia, claxon y choques también se generan con código. No requiere descargar canciones ni efectos externos. El audio empieza al pulsar **Jugar**. La música y la lluvia se detienen al volver al menú o perder (el golpe final sí suena); el audio se suspende cuando ocultas la pestaña.

Ejecuta `npm test` para comprobar las colisiones, los eventos y la separación de obstáculos.

Para publicar el juego, ejecuta `npm run build` y publica el contenido de `dist` en un servidor de archivos estáticos. El récord se guarda por navegador y origen, por lo que puede ser diferente entre la versión local y la publicada.

Este prototipo utiliza una carretera inspirada en el desierto; todavía no incluye calles reales ni niveles seleccionables. Para crear escenarios más detallados se pueden añadir modelos GLB propios o de bibliotecas como Kenney, Poly Pizza o Sketchfab; revisa siempre la licencia de cada recurso.

La silueta de Sonora del menú es una versión simplificada del límite estatal de [Natural Earth](https://www.naturalearthdata.com/), cuyos datos son de [dominio público](https://www.naturalearthdata.com/about/terms-of-use/).
