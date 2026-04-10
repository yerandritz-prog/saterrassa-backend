require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE', 'PATCH'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Base de datos
const db = new Database('reservas.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    personas INTEGER NOT NULL,
    ocasion TEXT,
    notas TEXT,
    estado TEXT DEFAULT 'confirmada',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Funciones de disponibilidad
function getReservasDia(fecha) {
  return db.prepare('SELECT * FROM reservas WHERE fecha = ? AND estado != ?').all(fecha, 'cancelada');
}

function getPersonasEnHora(fecha, hora) {
  const reservas = db.prepare(
    'SELECT SUM(personas) as total FROM reservas WHERE fecha = ? AND hora = ? AND estado != ?'
  ).get(fecha, hora, 'cancelada');
  return reservas.total || 0;
}

function hayDisponibilidad(fecha, hora, personas) {
  const ocupadas = getPersonasEnHora(fecha, hora);
  return (ocupadas + personas) <= 30;
}

function crearReserva(datos) {
  const stmt = db.prepare(
    'INSERT INTO reservas (nombre, telefono, fecha, hora, personas, ocasion, notas) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(datos.nombre, datos.telefono, datos.fecha, datos.hora, datos.personas, datos.ocasion || '', datos.notas || '');
  return result.lastInsertRowid;
}

// Tools para Claude
const tools = [
  {
    name: 'comprobar_disponibilidad',
    description: 'Comprueba si hay disponibilidad para una fecha, hora y número de personas',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        hora: { type: 'string', description: 'Hora en formato HH:MM' },
        personas: { type: 'number', description: 'Número de personas' }
      },
      required: ['fecha', 'hora', 'personas']
    }
  },
  {
    name: 'hacer_reserva',
    description: 'Hace una reserva si hay disponibilidad',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del cliente' },
        telefono: { type: 'string', description: 'Teléfono del cliente' },
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        hora: { type: 'string', description: 'Hora en formato HH:MM' },
        personas: { type: 'number', description: 'Número de personas' },
        ocasion: { type: 'string', description: 'Ocasión especial si la hay' },
        notas: { type: 'string', description: 'Notas adicionales o alergias' }
      },
      required: ['nombre', 'fecha', 'hora', 'personas']
    }
  },
  {
    name: 'ver_horas_disponibles',
    description: 'Muestra las horas disponibles para una fecha y número de personas',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        personas: { type: 'number', description: 'Número de personas' }
      },
      required: ['fecha', 'personas']
    }
  }
];

const SYSTEM_PROMPT = `Eres el asistente virtual de Sa Terrassa, restaurante mediterráneo en El Arenal, Mallorca.
Responde SIEMPRE en el idioma del cliente.

Datos del restaurante:
- Horario: Lunes a Domingo 09:00 a 23:00
- Capacidad máxima: 30 personas por franja horaria
- Teléfono: +34 971 XXX XXX
- Email: hola@saterrassa.com

Carta:
ENTRANTES: Pa amb oli (8€), Croquetas sobrasada (12€), Pulpo brasa (18€), Gazpacho (10€)
PRINCIPALES: Arroz langosta (38€), Lubina sal (32€), Tumbet mallorquín vegetariano (20€), Fideua sepia (26€)
POSTRES: Ensaimada (9€), Gató almendra (10€), Sorbete limón (8€), Tabla quesos (14€)

Alergias:
- Sin gluten: tumbet, lubina, pulpo, gazpacho, pescados. CON gluten: croquetas, ensaimada.
- Vegetariano: tumbet, pa amb oli, gazpacho, quesos, gató, sorbete.
- Alergias marisco: evitar arroz langosta y fideua.

RESERVAS - Instrucciones importantes:
- Puedes hacer reservas directamente usando las herramientas disponibles
- Cuando el cliente quiera reservar, pídele: nombre, fecha, hora y número de personas
- USA la herramienta comprobar_disponibilidad antes de confirmar
- Si hay hueco, USA hacer_reserva para confirmar
- Si no hay hueco, USA ver_horas_disponibles para sugerir alternativas
- Confirma siempre con un resumen claro de la reserva

Hoy es ${new Date().toISOString().split('T')[0]}.
Responde amable y breve, máximo 4 líneas salvo cuando hagas una reserva.`;

function processTool(toolName, toolInput) {
  if (toolName === 'comprobar_disponibilidad') {
    const disponible = hayDisponibilidad(toolInput.fecha, toolInput.hora, toolInput.personas);
    const ocupadas = getPersonasEnHora(toolInput.fecha, toolInput.hora);
    return JSON.stringify({
      disponible,
      personas_ocupadas: ocupadas,
      personas_libres: 30 - ocupadas,
      mensaje: disponible
        ? `Hay disponibilidad: ${30 - ocupadas} plazas libres a las ${toolInput.hora}`
        : `No hay disponibilidad a las ${toolInput.hora}. Solo quedan ${30 - ocupadas} plazas y necesitas ${toolInput.personas}.`
    });
  }

  if (toolName === 'hacer_reserva') {
    const disponible = hayDisponibilidad(toolInput.fecha, toolInput.hora, toolInput.personas);
    if (!disponible) {
      return JSON.stringify({ success: false, mensaje: 'No hay disponibilidad para esa hora.' });
    }
    const id = crearReserva(toolInput);
    return JSON.stringify({
      success: true,
      id,
      mensaje: `Reserva confirmada con ID #${id} para ${toolInput.nombre}, ${toolInput.personas} personas el ${toolInput.fecha} a las ${toolInput.hora}.`
    });
  }

  if (toolName === 'ver_horas_disponibles') {
    const horas = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30',
                   '13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30',
                   '17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30',
                   '21:00','21:30','22:00','22:30'];
    const disponibles = horas.filter(h => hayDisponibilidad(toolInput.fecha, h, toolInput.personas));
    return JSON.stringify({
      fecha: toolInput.fecha,
      personas: toolInput.personas,
      horas_disponibles: disponibles,
      mensaje: disponibles.length > 0
        ? `Horas disponibles para ${toolInput.personas} personas el ${toolInput.fecha}: ${disponibles.join(', ')}`
        : 'No hay disponibilidad para ese día.'
    });
  }

  return JSON.stringify({ error: 'Herramienta no encontrada' });
}

// Endpoint chat con tools
app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    let currentMessages = [...messages];

    let response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      tools,
      messages: currentMessages
    });

    // Loop para procesar tool calls
    while (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find(b => b.type === 'tool_use');
      if (!toolUseBlock) break;

      const toolResult = processTool(toolUseBlock.name, toolUseBlock.input);

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult }] }
      ];

      response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        tools,
        messages: currentMessages
      });
    }

    const textBlock = response.content.find(b => b.type === 'text');
    res.json({ reply: textBlock ? textBlock.text : 'Lo siento, ha habido un error.' });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Error al conectar con la IA' });
  }
});

// API Admin - ver todas las reservas
app.get('/admin/reservas', (req, res) => {
  const reservas = db.prepare('SELECT * FROM reservas ORDER BY fecha, hora').all();
  res.json(reservas);
});

// API Admin - cancelar reserva
app.patch('/admin/reservas/:id/cancelar', (req, res) => {
  db.prepare('UPDATE reservas SET estado = ? WHERE id = ?').run('cancelada', req.params.id);
  res.json({ success: true });
});

// API Admin - reservas de hoy
app.get('/admin/reservas/hoy', (req, res) => {
  const hoy = new Date().toISOString().split('T')[0];
  const reservas = db.prepare('SELECT * FROM reservas WHERE fecha = ? AND estado != ? ORDER BY hora').all(hoy, 'cancelada');
  res.json(reservas);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Sa Terrassa corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin en http://localhost:${PORT}/admin`);
});
