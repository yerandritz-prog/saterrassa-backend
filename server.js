require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');

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
    email TEXT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    personas INTEGER NOT NULL,
    ocasion TEXT,
    notas TEXT,
    estado TEXT DEFAULT 'confirmada',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// Enviar email de confirmación al cliente
async function enviarConfirmacionCliente(reserva) {
  if (!reserva.email) return;
  try {
    await transporter.sendMail({
      from: `"Sa Terrassa" <${process.env.GMAIL_USER}>`,
      to: reserva.email,
      subject: `✅ Reserva confirmada - Sa Terrassa #${reserva.id}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0D1B2A; color: #ffffff; padding: 40px;">
          <h1 style="font-family: Georgia, serif; color: #C9A84C; font-weight: 300; font-size: 2rem; margin-bottom: 5px;"><em>Sa</em> Terrassa</h1>
          <p style="color: rgba(255,255,255,0.5); font-size: 0.8rem; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 30px;">Cuina Mediterrània · El Arenal, Mallorca</p>
          <div style="border: 1px solid rgba(201,168,76,0.3); padding: 30px; margin-bottom: 30px;">
            <h2 style="color: #C9A84C; font-weight: 300; font-size: 1.3rem; margin-bottom: 20px;">Reserva confirmada</h2>
            <p style="color: rgba(255,255,255,0.8); margin-bottom: 10px;">Hola <strong>${reserva.nombre}</strong>,</p>
            <p style="color: rgba(255,255,255,0.7); margin-bottom: 25px;">Tu reserva ha sido confirmada. Te esperamos con mucho gusto.</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="color: rgba(255,255,255,0.4); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">Referencia</td><td style="color: #C9A84C; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">#${reserva.id}</td></tr>
              <tr><td style="color: rgba(255,255,255,0.4); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">Fecha</td><td style="color: #ffffff; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">${reserva.fecha}</td></tr>
              <tr><td style="color: rgba(255,255,255,0.4); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">Hora</td><td style="color: #ffffff; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">${reserva.hora}</td></tr>
              <tr><td style="color: rgba(255,255,255,0.4); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">Personas</td><td style="color: #ffffff; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">${reserva.personas}</td></tr>
              ${reserva.ocasion ? `<tr><td style="color: rgba(255,255,255,0.4); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 0;">Ocasión</td><td style="color: #ffffff; padding: 8px 0;">${reserva.ocasion}</td></tr>` : ''}
            </table>
          </div>
          <p style="color: rgba(255,255,255,0.5); font-size: 0.8rem;">Para cancelar o modificar tu reserva contacta con nosotros:<br>
          📞 +34 971 XXX XXX | ✉️ hola@saterrassa.com</p>
          <p style="color: rgba(255,255,255,0.3); font-size: 0.75rem; margin-top: 20px;">Passeig de la Mar, 47 · El Arenal, Mallorca</p>
        </div>
      `
    });
    console.log('Email confirmación enviado a:', reserva.email);
  } catch (error) {
    console.error('Error enviando email cliente:', error.message);
  }
}

// Enviar notificación al restaurante
async function enviarNotificacionRestaurante(reserva) {
  try {
    await transporter.sendMail({
      from: `"Sa Terrassa Bot" <${process.env.GMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `🔔 Nueva reserva #${reserva.id} - ${reserva.nombre} (${reserva.personas} personas)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e0e0e0;">
          <h2 style="color: #C9A84C;">Nueva reserva en Sa Terrassa</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr style="background: #f5f5f5;"><td style="padding: 10px; font-weight: bold;">ID</td><td style="padding: 10px;">#${reserva.id}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold;">Nombre</td><td style="padding: 10px;">${reserva.nombre}</td></tr>
            <tr style="background: #f5f5f5;"><td style="padding: 10px; font-weight: bold;">Fecha</td><td style="padding: 10px;">${reserva.fecha}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold;">Hora</td><td style="padding: 10px;">${reserva.hora}</td></tr>
            <tr style="background: #f5f5f5;"><td style="padding: 10px; font-weight: bold;">Personas</td><td style="padding: 10px;">${reserva.personas}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold;">Teléfono</td><td style="padding: 10px;">${reserva.telefono || '—'}</td></tr>
            <tr style="background: #f5f5f5;"><td style="padding: 10px; font-weight: bold;">Email</td><td style="padding: 10px;">${reserva.email || '—'}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold;">Ocasión</td><td style="padding: 10px;">${reserva.ocasion || '—'}</td></tr>
            <tr style="background: #f5f5f5;"><td style="padding: 10px; font-weight: bold;">Notas</td><td style="padding: 10px;">${reserva.notas || '—'}</td></tr>
          </table>
          <p style="margin-top: 20px; color: #666;">Ver todas las reservas: <a href="https://saterrassa-backend-production.up.railway.app/admin">Panel de administración</a></p>
        </div>
      `
    });
    console.log('Notificación enviada al restaurante');
  } catch (error) {
    console.error('Error enviando notificación restaurante:', error.message);
  }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getPersonasEnHora(fecha, hora) {
  const reservas = db.prepare('SELECT SUM(personas) as total FROM reservas WHERE fecha = ? AND hora = ? AND estado != ?').get(fecha, hora, 'cancelada');
  return reservas.total || 0;
}

function hayDisponibilidad(fecha, hora, personas) {
  const ocupadas = getPersonasEnHora(fecha, hora);
  return (ocupadas + personas) <= 30;
}

function crearReserva(datos) {
  const stmt = db.prepare('INSERT INTO reservas (nombre, telefono, email, fecha, hora, personas, ocasion, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(datos.nombre, datos.telefono || '', datos.email || '', datos.fecha, datos.hora, datos.personas, datos.ocasion || '', datos.notas || '');
  return result.lastInsertRowid;
}

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
        email: { type: 'string', description: 'Email del cliente para confirmación' },
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

RESERVAS:
- Pide siempre: nombre, fecha, hora, personas
- Pregunta también por email para enviar confirmación (opcional pero recomendado)
- USA comprobar_disponibilidad antes de confirmar
- Si hay hueco, USA hacer_reserva
- Si no hay hueco, USA ver_horas_disponibles

Hoy es ${new Date().toISOString().split('T')[0]}.
Responde amable y breve, máximo 4 líneas.`;

function processTool(toolName, toolInput) {
  if (toolName === 'comprobar_disponibilidad') {
    const disponible = hayDisponibilidad(toolInput.fecha, toolInput.hora, toolInput.personas);
    const ocupadas = getPersonasEnHora(toolInput.fecha, toolInput.hora);
    return JSON.stringify({
      disponible,
      personas_libres: 30 - ocupadas,
      mensaje: disponible
        ? `Hay disponibilidad: ${30 - ocupadas} plazas libres a las ${toolInput.hora}`
        : `No hay disponibilidad a las ${toolInput.hora}. Solo quedan ${30 - ocupadas} plazas.`
    });
  }

  if (toolName === 'hacer_reserva') {
    const disponible = hayDisponibilidad(toolInput.fecha, toolInput.hora, toolInput.personas);
    if (!disponible) return JSON.stringify({ success: false, mensaje: 'No hay disponibilidad.' });
    const id = crearReserva(toolInput);
    const reserva = { id, ...toolInput };
    enviarConfirmacionCliente(reserva);
    enviarNotificacionRestaurante(reserva);
    return JSON.stringify({
      success: true,
      id,
      mensaje: `Reserva #${id} confirmada para ${toolInput.nombre}, ${toolInput.personas} personas el ${toolInput.fecha} a las ${toolInput.hora}. Se enviará email de confirmación.`
    });
  }

  if (toolName === 'ver_horas_disponibles') {
    const horas = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30',
                   '13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30',
                   '17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30',
                   '21:00','21:30','22:00','22:30'];
    const disponibles = horas.filter(h => hayDisponibilidad(toolInput.fecha, h, toolInput.personas));
    return JSON.stringify({
      horas_disponibles: disponibles,
      mensaje: disponibles.length > 0
        ? `Horas disponibles para ${toolInput.personas} personas el ${toolInput.fecha}: ${disponibles.join(', ')}`
        : 'No hay disponibilidad para ese día.'
    });
  }

  return JSON.stringify({ error: 'Herramienta no encontrada' });
}

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

app.get('/admin/reservas', (req, res) => {
  const reservas = db.prepare('SELECT * FROM reservas ORDER BY fecha, hora').all();
  res.json(reservas);
});

app.patch('/admin/reservas/:id/cancelar', (req, res) => {
  db.prepare('UPDATE reservas SET estado = ? WHERE id = ?').run('cancelada', req.params.id);
  res.json({ success: true });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Sa Terrassa corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin en http://localhost:${PORT}/admin`);
});
