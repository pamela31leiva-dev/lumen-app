# Lumen — Centro de inteligencia patrimonial

## Objetivo
Transformar la vista actual en una consola financiera premium, oscura e inmersiva, completamente visual y alimentada por datos mock realistas.

## Experiencia a construir
- Encabezado compacto con marca Lumen, contexto patrimonial, alertas y perfil.
- Consola gravitacional flotante con adjuntos, micrófono, entrada en lenguaje natural y acciones para registrar o importar documentos.
- Bloque editorial de patrimonio neto con evolución, liquidez disponible y métricas determinísticas.
- Visualización de evolución patrimonial y distribución de activos con lectura clara.
- Lista de movimientos recientes con categorías, estados y montos alineados.
- Modal funcional para registrar un movimiento con campos de vidrio y foco esmeralda.
- Estados locales para periodos, búsqueda, acciones rápidas y apertura/cierre del modal.

## Dirección visual
- Fondo obsidiana con iluminación ambiental verde y ámbar muy sutil.
- Superficies translúcidas con desenfoque, bordes iluminados y sombras profundas.
- Tipografía editorial de alto contraste para cifras; sans limpia para controles y lectura.
- Movimiento orgánico y discreto, con respeto por preferencias de movimiento reducido.
- Diseño adaptable: navegación y acciones compactas en móvil, mayor densidad informativa en escritorio.

## Implementación técnica
- Componentes React desacoplados dentro de la capa visual.
- Primitives existentes de shadcn/ui para botones, diálogo, campos y etiquetas.
- Tailwind CSS v4 y tokens semánticos centralizados en los estilos globales.
- Recharts para la evolución patrimonial; sin servicios, persistencia ni llamadas externas.
- Datos mock coherentes con un portafolio patrimonial colombiano de alto valor.

## Validación
- Verificar renderizado e interacciones principales en escritorio y móvil.
- Confirmar que no existan errores en consola ni desbordamientos visibles.
- Revisar contraste, legibilidad de cifras, estados de foco y comportamiento del modal.
