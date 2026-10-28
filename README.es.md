# dsh-free-websearch

[![npm](https://img.shields.io/npm/v/@jamolpe88/dsh-free-websearch?style=flat-square&logo=npm&label=npm)](https://www.npmjs.com/package/@jamolpe88/dsh-free-websearch)
[![npm downloads](https://img.shields.io/npm/dm/@jamolpe88/dsh-free-websearch?style=flat-square&logo=npm&label=downloads)](https://www.npmjs.com/package/@jamolpe88/dsh-free-websearch)
[![GitHub release](https://img.shields.io/github/v/release/JaMoLpE88/dsh-free-websearch?style=flat-square&logo=github&label=release)](https://github.com/JaMoLpE88/dsh-free-websearch/releases)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.1--rc.3-4B8BBE?style=flat-square)](#compatibilidad)
[![node](https://img.shields.io/badge/node-%3E%3D20.3-5FA04E?style=flat-square&logo=node.js&logoColor=white)](#compatibilidad)
[![sin clave](https://img.shields.io/badge/API%20key-ninguna-3FB950?style=flat-square)](#por-qué-no-hay-ajustes)
[![dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/jamolpe88/dsh-free-websearch)

**Búsqueda web y lectura de páginas gratis para DeepSeek Harness.** Cinco motores sin
clave detrás de las propias herramientas `web_search` y `web_fetch` del harness, con
failover automático y con los proveedores de pago de DeepSeek apagados. Instálalo y la
plataforma de DeepSeek queda fuera del circuito, uses el modelo que uses.

Cero configuración. Sin registro, sin clave, sin página de ajustes y sin respaldo de pago:
si todos los carriles gratuitos fallan, la búsqueda devuelve un informe en vez de gastar
un crédito.

**English** → [README.md](README.md)

![Cómo se colocan los carriles gratuitos detrás de las herramientas del harness](assets/how-it-works.png)

*Las herramientas no cambian. La costura `ctx.web` elige un proveedor por llamada, este
bundle fija el suyo y detrás responden cinco carriles sin clave. El mismo parche desactiva
los proveedores de búsqueda y lectura de DeepSeek, así que no hay camino de vuelta a la API
de pago por accidente.*

![Failover entre carriles](assets/failover.png)

*Una búsqueda, un carril. La primera respuesta corta la cadena, así que las demás cuotas
quedan intactas; un carril bloqueado entra en cuarentena y responde el siguiente.*

![Capacidad de los carriles gratuitos](assets/coverage.png)

*Dos carriles no tienen tope publicado, y por eso son el suelo de la cadena y no la cabeza.
Las cuotas anónimas se comparten por IP, así que los ilimitados cubren una red ocupada.*

![La tarjeta de citas que ve el modelo](assets/tool-card.png)

*La misma tarjeta de citas que pinta el proveedor de pago: títulos, URLs y fragmentos,
sin una sola clave de API.*

## Qué hace

- Sirve **`web_search`** a través de cinco motores gratuitos: Keenable, Firecrawl keyless, Bing, DuckDuckGo y You.com.
- Sirve **`web_fetch`** en local primero (el proveedor HTTP del propio harness) y escala al scrape keyless de Firecrawl sólo cuando la página es un muro, viene vacía o es un shell de JavaScript.
- **Desactiva los proveedores de pago de DeepSeek** (`deepseek-official`, `deepseek-search-api`, `deepseek-fetch-api`), de modo que ningún ajuste, cadena de respaldo ni interruptor de la UI pueda alcanzarlos.
- Salta al siguiente carril en orden y se detiene en el primero que responde: una búsqueda gasta la cuota de un carril, no de cinco.
- Cachea resultados **5 minutos** (50 entradas), así que repetir una pregunta no cuesta nada.
- Pone en cuarentena un carril tras un muro (5 min) o una cuota mensual agotada (el resto del proceso) en lugar de martillearlo.
- Nombra todos los carriles que probó cuando se rinde, y avisa de que no se envió nada a una API de pago.
- Devuelve el comportamiento original de DeepSeek al desactivar o desinstalar el bundle.

## Qué no hace

- No añade herramientas. Ni `x_search`, ni `read_page`, ni `multi_search`, ni pipeline de investigación.
- No lee credenciales. Ni las de DeepSeek ni las de nadie: el plugin no importa el servicio de credenciales, así que no puede gastar una clave guardada.
- No llama a `api.deepseek.com` bajo ninguna circunstancia.
- No raspa cookies, no guarda historial y no envía telemetría.
- No renderiza JavaScript en local. Escala, y sólo para destinos públicos.

## Por qué no hay ajustes

No hay nada que decidir. El orden de carriles es el mismo para todos, todos son sin clave y
las cuotas son anónimas. Una página de ajustes sólo te pediría elegir un carril cuya cuota
no puedes ver y cuyo fallo la cadena ya resuelve.

La única decisión que importa —"¿esto me puede costar dinero?"— no es una preferencia: la
responde el parche del bundle. Los proveedores de pago están desactivados, así que la
respuesta es no.

## Qué sustituye

| Ruta de pago del harness | Proveedor | Cómo queda |
|---|---|---|
| Búsqueda por Messages (`web_search_20250305`) | `deepseek-official` | Desactivada. `web_search` usa la cadena gratuita |
| Search API (`/v1/tools/search`) | `deepseek-search-api` | Desactivada, mismo sustituto |
| Fetch API (`/v1/tools/fetch`) | `deepseek-fetch-api` | Desactivada. `web_fetch` usa local → scrape keyless |
| Lectura local | `http` | Se conserva, y se delega en ella en vez de reimplementarla |

Todo lo demás que hace el harness —títulos de sesión, compactación, subagentes, workflows—
va por **tu modelo**, no por un endpoint de DeepSeek. No hay un tercer sitio que arreglar.

## Los cinco carriles

Se prueban en este orden. Un carril se salta mientras está en cuarentena.

| Carril | Endpoint | Cuota anónima | Papel |
|---|---|---|---|
| `keenable` | `api.keenable.ai/v1/search/public` | 1.000 peticiones/hora por IP | Absorbe casi todo: JSON, ~0,4 s |
| `firecrawl` | `api.firecrawl.dev/v2/search` | 1.000 créditos/mes | Mejores fragmentos; escaso, por eso va segundo |
| `bing` | `www.bing.com/search?format=rss` | Sin tope publicado | El suelo, ~0,3 s, URLs directas |
| `ddg` | `html.duckduckgo.com/html/` | Sin tope publicado | El otro suelo |
| `you` | `api.you.com/v1/agents/search` | 100 búsquedas/día por IP | Último recurso |

Presupuestos: **7 s por carril**, **30 s por búsqueda**, cadena de cinco y caché de 5 minutos.
Sin reintentos dentro de un carril: un fallo pasa al siguiente, que es más barato que esperar
a un servidor que ya ha dicho que no.

## Requisitos

- **DSH Desktop** `>= 0.2.1-rc.3`, perfil `desktop` (probado en `0.2.1-rc.3`, Windows 11).
- Salida HTTPS. Nada más.
- Node 22+ (DSH trae el suyo; el paquete sólo necesita 20.3).

Sin clave de DeepSeek. Sin proveedor configurado. Sin cuenta.

## Instalar

Desde la app de escritorio: **Plugins → Añadir plugin**, y escribe `@jamolpe88/dsh-free-websearch`.

Desde npm:

```bash
dsh plugin --profile desktop add @jamolpe88/dsh-free-websearch
```

El perfil `web` instala el mismo paquete:

```bash
dsh plugin --profile web add @jamolpe88/dsh-free-websearch
```

Desde el repositorio:

```bash
dsh plugin --profile desktop add github:JaMoLpE88/dsh-free-websearch
```

Desde una copia local, mientras desarrollas:

```bash
dsh plugin --profile desktop add link:C:\ruta\a\dsh-free-websearch
```

Refresca la ventana de DSH. En un perfil vivo el bundle se aplica sin reiniciar; la página
de Plugins lista **Free Web Search** y la tarjeta oficial **Web search** deja de aparecer,
porque sus dos proveedores ya no están montados.

## Uso

1. Pregunta lo que necesite web, como siempre. El modelo llama a `web_search`; las fuentes vuelven con su tarjeta de citas.
2. Pega un enlace o pregunta por una página. `web_fetch` la lee en local y sólo escala si la página necesita un navegador.
3. Nada más. No hay comando, ni píldora, ni panel.

Si una búsqueda falla, el error nombra los carriles probados y el motivo, por ejemplo
`keenable: HTTP 429; bing: no results`. Reintenta, o comprueba si una VPN está reescribiendo
tu IP de salida.

## Cómo funciona

El plugin registra dos proveedores en la costura que ya existe, y el parche del bundle los
selecciona:

```js
ctx.web.registerSearchProvider({ id: 'freeweb', available: () => true, search })
ctx.web.registerFetchProvider({ id: 'freeweb-fetch', available: () => true, fetch })
```

```yaml
- id: web
  config:
    searchProvider: freeweb
    fetchProvider: freeweb-fetch
- id: web-search-deepseek
  disabled: true
- id: web-deepseek-api
  disabled: true
```

- **La selección va fijada de forma declarativa.** Un parche reemplaza toda la config de la fila objetivo, así que se reescriben las dos claves de la costura. Desinstalar el bundle retira juntos el pin y las desactivaciones; el harness vuelve a `deepseek-official` / `http`.
- **Un respaldo en runtime cubre la instalación manual.** Si el parche del bundle no llegó a aplicarse (dependencia suelta, perfil antiguo), el plugin escribe la misma selección con `settings.mutate` cuando el servicio de ajustes está montado, y sólo si el valor actual es el de fábrica. Nunca pisa una elección deliberada, y al descargarse escribe de vuelta los ids originales.
- **`available()` es barato y offline.** El veredicto honesto pertenece a la ejecución, cuyo error lleva cada intento; responder `false` por adelantado convertiría un problema de red pasajero en un error de configuración de la costura.
- **La cadena de fetch reutiliza el harness.** `freeweb-fetch` delega primero en el proveedor `http` registrado, así que la validación de URL, el anclaje de direcciones, las reglas de redirección y la conversión HTML→markdown siguen siendo del harness. Sólo cuando ese resultado es un muro, está vacío o es un shell de JavaScript, el plugin llama al scrape keyless de Firecrawl.
- **La divulgación se comprueba antes de ocurrir.** Todas las direcciones resueltas del destino tienen que ser públicas antes de enviar la URL a Firecrawl. `localhost`, rangos privados, CGNAT y link-local no salen de la máquina, y un host que no resuelve tampoco se divulga.

## Verificarlo

```bash
npm test        # 16 pruebas: parsers, failover, cuarentena, caché, guarda SSRF, takeover
npm run probe   # comprobación real de los cinco endpoints y del escalado de fetch
```

El probe imprime el estado HTTP de cada carril, lanza búsquedas reales por la cadena con su
latencia y sus fuentes, y demuestra que un destino privado bloqueado nunca escala. Usa la red;
las pruebas no.

## Desinstalar y revertir

Quita el bundle (Plugins → Remove, o `dsh plugin --profile desktop remove @jamolpe88/dsh-free-websearch`).
La capa de parche desaparece con él:

- `web` vuelve a `searchProvider: deepseek-official` / `fetchProvider: http`,
- los dos proveedores de DeepSeek se reactivan,
- no quedan ficheros del plugin, ni ajustes propios, ni estado.

Desactivar el bundle tiene el mismo efecto. Si se instaló como dependencia suelta, el plugin
además escribe los ids originales al descargarse.

## Compatibilidad

| | |
|---|---|
| DSH | `>= 0.2.1-rc.3` (la única versión probada por el autor) |
| Node | `>= 20.3` (el paquete); DSH trae 22+ |
| SO | Windows 11 (probado); el código es Node puro, macOS y Linux sin probar |
| Perfil | `desktop` (probado); `web` arranca y busca por la misma costura |
| Costura | proveedores de search + fetch de `ctx.web` |
| Catálogo | [listado en dsh-plugin.org](https://dsh-plugin.org/plugins/jamolpe88/dsh-free-websearch) |

Estado de validación: **probado en Windows 11 con DSH Desktop 0.2.1-rc.3** (2026-10-28). El
bundle se aplicó en caliente, los dos proveedores de pago salieron de la composición,
`web_search` devolvió ocho fuentes citadas desde la cadena gratuita, `web_fetch` devolvió el
texto de la página y un destino privado bloqueado fue rechazado sin petición a la nube.

Sin validar: macOS, Linux, otras versiones de DSH y el perfil `web`.

## Límites

- **Los carriles son cortesía de terceros.** Las cuotas anónimas pueden cambiar, encogerse o empezar a pedir CAPTCHA sin avisar. Por eso hay cinco y por eso hay failover.
- **Una VPN puede romper los tramos keyless.** Firecrawl filtra su tramo anónimo por IP de salida y puede responder 403; Keenable y Bing mantienen la búsqueda viva.
- **Bing a veces sirve un SERP vacío a IPs de datacenter o proxy.** DuckDuckGo es el segundo carril ilimitado para ese caso.
- **Sin búsqueda de X/Twitter.** No hay camino gratis que no exija una cuenta de pago, así que el plugin no lo finge.
- **Sin render de JavaScript propio.** El escalado a un scraper en la nube es la única vía tipo navegador, y sólo para páginas públicas.
- **Las cuotas anónimas se comparten por IP.** Una red de oficina ocupada ve los topes keyless antes que una conexión doméstica.

## Privacidad

- La consulta va al carril que responde, y a cada carril probado antes que él. Nada más.
- La URL de una página sale de la máquina sólo por el escalado de `web_fetch`, y sólo después de comprobar que todas las direcciones resueltas son públicas.
- Sin cookies, sin clave, sin cuenta, sin almacenamiento local, sin telemetría.
- El plugin nunca lee el almacén de credenciales, así que ninguna clave de API puede filtrarse por él.

Política corta en [SECURITY.md](SECURITY.md).

## Problemas

**Las búsquedas fallan con "every free search lane failed".**
El mensaje lista cada carril y su error. `HTTP 429` en keenable significa que la reserva
horaria compartida se agotó; `bot wall` en ddg significa que pide CAPTCHA. Reintenta en unos
minutos o desactiva la VPN.

**`web_fetch` devuelve una página con muy poco texto.**
La lectura local funcionó pero el sitio se renderiza con JavaScript y el escalado no encontró
nada mejor. No está roto: es lo que sirve el sitio.

**La tarjeta oficial "Web search" ha desaparecido de Plugins.**
Es lo esperado: sólo existe mientras `web-search-deepseek` sirve su namespace, y este bundle
lo desactiva. Desinstálalo para recuperarla.

**Una página se rechaza como destino privado.**
La guarda del escalado se negó a enviarla a la nube. La lectura local sí funcionó; sólo se
bloquea el camino a la nube.

## Desarrollo

```bash
npm test        # node --test
npm run probe   # comprobación real de carriles
python tools/make-assets.py   # regenera las imágenes de assets/
```

El paquete es JavaScript plano sin build y sin dependencias de ejecución. Las pruebas
sustituyen `fetch`, así que corren offline y nunca tocan un endpoint real.

## Marcas de terceros

DeepSeek, Bing, DuckDuckGo, Firecrawl, Keenable y You.com son marcas de sus respectivos
propietarios. Se nombran sólo para describir a qué servicio habla cada carril; no se incluye
ningún logotipo y no se implica afiliación.

## Licencia

[MIT](LICENSE) © 2026 JaMoLpE88
