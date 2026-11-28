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
- Mantén **Espacio**, el **clic izquierdo sobre la carretera** o un **dedo sobre la carretera** para ganar un 50 % de velocidad en cualquier momento, también durante una persecución; al soltarlo vuelves a la velocidad normal. Puedes cambiar de carril con las flechas, los botones laterales o deslizando el dedo/mouse sin soltar (cada desplazamiento de más de 25 píxeles permite otro cambio). No hay botón ni aviso de aceleración durante la partida. Con varios dedos, la aceleración continúa mientras alguno siga sobre la carretera. Al cancelar el gesto, salir, perder, ocultar la pestaña o perder el foco se libera el acelerador.
- La indicación de controles desaparece a los tres segundos de iniciar cada partida; las flechas táctiles siguen disponibles.
- Al acelerar aparecen líneas de velocidad animadas en los bordes, sin tapar el centro de la carretera ni bloquear los controles. Desaparecen al soltar, perder o volver al menú. Si el navegador solicita reducir el movimiento, las líneas se muestran sin animación.
- En **Configuración** puedes ocultar los dibujos de los botones laterales (sus zonas táctiles, el teclado y los gestos siguen funcionando) y activar o desactivar música y efectos por separado. Las opciones se guardan en el navegador.
- También puedes elegir el **color de tu carro**; se guarda y se aplica al iniciar o repetir partidas, sin cambiar el color de otros vehículos.
- **Radio:** elige entre **Regional** (predeterminada, polca instrumental con acordeón, tuba y batería), **Original** (la melodía sintetizada inicial de Bachenora) y **Driving** (la pista MP3 anterior). Puedes seleccionarla en Configuración o recorrer las tres estaciones con el botón **Radio** durante la partida. La selección se guarda, incluso si la música está apagada. Las configuraciones antiguas sin estación empiezan en Regional.
- El récord se guarda en el navegador cuando el almacenamiento local está disponible.
- El recorrido termina al colisionar con un peligro, no por un límite de tiempo. Todas las zonas de choque son un 20 % menores en ancho y largo que antes: rozar los bordes permite seguir jugando, pero los impactos de lleno siguen siendo mortales. El mismo margen se aplica a los carros que rebasan. La pantalla final indica la causa de la colisión.

## Usuarios, puntuaciones y Supabase

- Al abrir el juego, se crea o reutiliza una identidad anónima de Supabase con apodo automático **Invitado 1**, **Invitado 2**, etc. La numeración es global y puede tener saltos. No se pide correo para jugar ni publicar puntuaciones.
- **Mi jugador** permite cambiar el apodo sin correo y vincular opcionalmente un correo mediante enlace, sin contraseña. El apodo público admite 3–20 letras sin acentos, números, espacios y guiones.
- Cada partida registra inicio, metros, segundos de juego y final por choque o salida al menú. Una pestaña cerrada abruptamente deja una partida iniciada sin final; no se inventa un resultado ni se reintentan partidas offline. Los errores se muestran en el menú o en el resultado y no impiden jugar ni conservar el récord local.
- La **Tabla de puntuaciones** muestra los 20 mejores jugadores, incluidos los invitados, con una sola marca por identidad. Las partidas terminadas por choque publican puntuación; salir al menú únicamente registra uso.
- El correo permanece en Supabase Auth, no en las tablas públicas. El cliente del juego envía identidad, apodo y datos de partida, no añade IP, geolocalización ni huella de dispositivo; Supabase puede mantener sus propios registros técnicos. Las estadísticas de uso solo están disponibles para el administrador desde SQL Editor.
- Al vincular correo, abre el enlace en el mismo navegador y origen desde donde lo solicitaste, dentro de una hora. Se transfiere el historial del invitado y se conserva la mayor puntuación entre invitado y cuenta existente; si la cuenta ya tiene apodo, lo conserva. Una cuenta nueva conserva el apodo del invitado. La transferencia exige un comprobante temporal guardado en el navegador y que el correo autenticado coincida con el solicitado; no basta conocer el identificador de otro jugador. No incluyas ese comprobante en URLs, logs o Git.
- Confirma la vinculación entre partidas para no cambiar de cuenta mientras se guarda una partida. Si la sincronización falla, el comprobante se conserva para reintentar. **Continuar sin sincronizar** permite descartarlo con confirmación explícita; no transfiere los resultados del invitado.
- Sin correo vinculado, borrar los **datos del sitio/almacenamiento local** (no solo los archivos en caché) o cambiar de dispositivo crea otro invitado. Sus resultados antiguos siguen en el servidor, pero no puedes recuperarlos sin vinculación previa. Con correo, puedes entrar desde otro dispositivo y recuperar tu cuenta; para transferir resultados de un invitado concreto, la primera confirmación debe abrirse en su navegador original. En una futura app móvil, el enlace necesitará configurar enlaces profundos (deep links).

### Activación del proyecto

La dirección base es `https://akvvzeehnbyuqiwgtbzs.supabase.co`, sin `/rest/v1/`. El juego utiliza únicamente la clave **Publishable**, que es pública; nunca la contraseña de Postgres ni una clave `secret`/`service_role`.

1. En **SQL Editor**, ejecuta una vez el archivo completo `supabase/migrations/20261128060000_player_accounts.sql` en el proyecto nuevo. Crea perfiles, partidas, récords y funciones con permisos explícitos y RLS. Si ya tienes tablas con esos nombres, no lo ejecutes sin revisar los conflictos.
   Después ejecuta `supabase/migrations/20261128080000_guest_profiles_and_sync.sql`. Si ya aplicaste la primera migración, ejecuta **solo esta segunda**: añade apodos automáticos, ranking de invitados y sincronización por correo, recuperando los resultados de invitado guardados por la versión anterior.
2. En **Authentication → Sign In / Providers**, habilita **Email** y **Anonymous Sign-Ins**. Conserva los límites de peticiones. Para producción, configura CAPTCHA y su token en el cliente antes de exigirlo a los invitados; esta primera versión no incluye un widget CAPTCHA.
3. En **Authentication → URL Configuration**, pon la URL publicada del juego como **Site URL** y añádela también a **Redirect URLs**. Para pruebas locales añade exactamente la dirección utilizada, por ejemplo `http://127.0.0.1:5173/`. Si Vite cambia de puerto, autoriza también esa dirección. Mantén la plantilla estándar de Magic Link con `{{ .ConfirmationURL }}`.
4. Configura **SMTP propio** antes de abrir registros al público: el correo integrado de Supabase tiene restricciones de destinatarios y límites bajos. Comprueba el envío y recepción del enlace con tu correo.
5. Copia `.env.example` a `.env.local` para desarrollo. Ambas variables son públicas (`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`), y `.env.local` está ignorado por Git. En el alojamiento web configura las mismas variables **antes de compilar** y vuelve a desplegar. No agregues secretos a variables `VITE_*`: quedan visibles en el navegador.
6. Comprueba el apodo automático, cambio sin correo, puntuación de invitado y vinculación con correo nuevo/existente. Si falta una configuración, se muestra el error; no se anuncia una puntuación guardada sin confirmación del servidor.

**Conexión con GitHub:** vincular el repositorio no instala automáticamente esta integración ni aloja el juego. Las tablas se versionan como migraciones SQL en `supabase/migrations`. Para despliegues automáticos debes preparar Supabase CLI/configuración y habilitar/configurar la integración de GitHub (directorio de trabajo `.` y rama de producción apropiada). Si aplicas primero el SQL manualmente, sincroniza su historial de migraciones antes de activar despliegues para no intentar crear las mismas tablas dos veces. No subas credenciales de base de datos al repositorio. Esta versión deja la migración preparada, pero no configura por sí sola el despliegue remoto desde GitHub.

### Consultar el uso (solo administrador)

Ejecuta en **SQL Editor** para ver los últimos 30 días, agrupados por fecha UTC:

```sql
select (started_at at time zone 'UTC')::date as dia,
  count(*) as partidas_iniciadas,
  count(*) filter (where ended_at is not null) as partidas_guardadas,
  count(*) filter (where guest) as partidas_invitado,
  count(distinct user_id) as identidades_activas,
  round((coalesce(sum(seconds), 0) / 60)::numeric, 1) as minutos_jugados,
  coalesce(sum(meters), 0) as metros
from public.game_runs
where started_at >= now() - interval '30 days'
group by 1 order by 1 desc;

select count(*) as cuentas_con_correo
from auth.users where not is_anonymous and email_confirmed_at is not null;
```

Los minutos y metros solo suman partidas con final guardado; no incluyen actividad que se cerró sin guardar. Para borrar los datos de un jugador, elimina su usuario desde **Authentication → Users**: los perfiles, partidas y récords se eliminan en cascada. Define una política de retención y limpieza de invitados antes de un lanzamiento público.

**Límite del ranking básico:** la base de datos verifica propiedad, final único, número de partidas por minuto y distancia máxima compatible con 63 m/s. No permite escribir directamente récords o partidas desde la API. Esto no es un sistema antitrampas: el juego corre en el cliente y un usuario puede falsificar resultados plausibles. No lo uses para premios o competiciones sin validación de juego en un servidor.

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
- **Camiones urbanos:** aparecen tanto como tráfico que adelantas como en rebases, con carrocerías rojo/blanco, naranja/blanco y turquesa inspiradas en las referencias. Sus hitboxes y maniobras consideran su mayor longitud y mantienen el margen de tolerancia.
- **Direccionales:** algunos autos y camiones intentan acercarse un carril hacia el tuyo. Señalan durante un segundo y después se desplazan, como máximo una vez por vehículo. Cancelan si la ruta está bloqueada o compromete un carril reservado. Los que rebasan solo lo intentan después de pasar; tras completar la maniobra bajan la velocidad para que puedas adelantarlos. Acelerar también reduce la velocidad relativa con la que te alcanzan.
- **Semáforos:** aparecen verdes desde el horizonte y pasan a amarillo intermitente antes del rojo. Su reloj no se acelera con tu carro: el acelerón permite cruzar a tiempo. La infracción se decide por el color en el instante de cruzar la línea; un rojo posterior al cruce no te penaliza.
- **Persecución:** cruzar en rojo activa una patrulla durante 10 segundos de juego. Debes seguir esquivando los peligros habituales; si sobrevives, se retira, termina la sirena y vuelve la música normal. Las SUV tienen variantes claras y oscuras, franjas azul oscuro, defensa frontal y luces rojas/azules, sin nombres, marcas ni emblemas oficiales. El menú y los reinicios cancelan el evento.
- En el 35 % de los rebases suena además una de sus dos voces exclusivas al azar, 1.6 segundos después del claxon para no tapar el aviso. Las seis voces de la señora inundada no se usan en rebases. Las voces pendientes se cancelan al volver al menú, terminar la partida o retirar su vehículo.

## Audio

La radio combina la melodía original de Web Audio con dos pistas MP3: la polca instrumental de inspiración regional y Driving. Durante las persecuciones suena la pista orquestal de peligro, independientemente de la estación; al terminar vuelve la estación seleccionada. Cambiar la radio durante una persecución no interrumpe su música. La lluvia, la sirena policial, el claxon, los choques, el movimiento de tapas y los derrumbes de socavones usan grabaciones locales en `assets/audio`; la lluvia y la sirena se reproducen como bucles. Los golpes de baches y las salpicaduras siguen siendo sintetizados. El audio empieza al pulsar **Jugar**. La música, la lluvia, las sirenas y las voces se detienen al volver al menú o perder (el golpe final sí suena); el audio se suspende cuando ocultas la pestaña. **Música** controla las tres estaciones y la pista de peligro, mientras **Efectos de sonido** controla la sirena y los demás efectos independientemente.

La pista Regional tiene una ganancia propia para compensar el menor volumen de su grabación y equilibrarla con Driving, sin aumentar las otras estaciones ni los efectos.

Los efectos de vehículos y obstáculos siguen su posición con respecto al jugador: lejos suenan bajos, aumentan al acercarse y vuelven a bajar cuando quedan atrás. La variación se suaviza para evitar saltos de volumen. La música y la lluvia ambiental no dependen de un objeto de la carretera. Al retirar un objeto también se cancelan sus sonidos activos o pendientes.

### Fuentes y permisos del audio

- `regional-music.mp3`: [Double Polka, Kevin MacLeod (incompetech.com)](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100253), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), sin editar. Polca con acordeón, tuba y batería, usada para dar un aire regional; no se presenta como una canción tradicional sonorense. El crédito aparece en Configuración.
- `driving-music.mp3`: [Driving (remastered), jeffmatthews410](https://opengameart.org/content/driving-0), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), sin editar. Se reproduce de nuevo al terminar; el autor no garantiza un bucle perfecto. El crédito aparece en Configuración.
- `chase-music.mp3`: MP3 de presentación de [Determined Pursuit, Emma_MA](https://opengameart.org/content/determined-pursuit-epic-orchestra-loop), [CC0](https://creativecommons.org/publicdomain/zero/1.0/), sin editar. La reproducción comienza en el segundo 1 para omitir el silencio inicial.
- `police-siren.mp3`: [MISC_Police_Siren_Int_Onboard_002.wav, conleec](https://freesound.org/people/conleec/sounds/159752/), [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Versión MP3 de una grabación a bordo con sirena y motor reales, sin editar.
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
