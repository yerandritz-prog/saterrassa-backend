require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const Database = require('better-sqlite3');
const { Resend } = require('resend');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE', 'PATCH'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── BASE DE DATOS ───────────────────────────────────────────────────────────

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
  );

  CREATE TABLE IF NOT EXISTS reservas_hotel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    checkin TEXT NOT NULL,
    checkout TEXT NOT NULL,
    tipo_habitacion TEXT NOT NULL,
    huespedes INTEGER NOT NULL,
    peticiones TEXT,
    estado TEXT DEFAULT 'confirmada',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── RESEND ───────────────────────────────────────────────────────────────────

const resend = new Resend(process.env.RESEND_API_KEY);

// Emails Sa Terrassa
async function enviarConfirmacionCliente(reserva) {
  if (!reserva.email) return;
  try {
    await resend.emails.send({
      from: 'Sa Terrassa <onboarding@resend.dev>',
      to: reserva.email,
      subject: `✅ Reserva confirmada - Sa Terrassa #${reserva.id}`,
      html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0D1B2A;color:#fff;padding:40px;"><h1 style="color:#C9A84C;font-weight:300;"><em>Sa</em> Terrassa</h1><p style="color:rgba(255,255,255,0.5);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.2em;">Cuina Mediterrània · El Arenal, Mallorca</p><div style="border:1px solid rgba(201,168,76,0.3);padding:30px;margin:20px 0;"><h2 style="color:#C9A84C;font-weight:300;">Reserva confirmada ✅</h2><p>Hola <strong>${reserva.nombre}</strong>, tu reserva ha sido confirmada.</p><table style="width:100%;"><tr><td style="color:rgba(255,255,255,0.4);padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Referencia</td><td style="color:#C9A84C;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">#${reserva.id}</td></tr><tr><td style="color:rgba(255,255,255,0.4);padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Fecha</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">${reserva.fecha}</td></tr><tr><td style="color:rgba(255,255,255,0.4);padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Hora</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">${reserva.hora}</td></tr><tr><td style="color:rgba(255,255,255,0.4);padding:8px 0;">Personas</td><td style="padding:8px 0;">${reserva.personas}</td></tr></table></div><p style="color:rgba(255,255,255,0.4);font-size:0.8rem;">Para cancelar: +34 971 XXX XXX | hola@saterrassa.com</p></div>`
    });
  } catch (error) {
    console.error('Error email cliente restaurante:', error.message);
  }
}

async function enviarNotificacionRestaurante(reserva) {
  try {
    await resend.emails.send({
      from: 'Sa Terrassa Bot <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL,
      subject: `🔔 Nueva reserva #${reserva.id} - ${reserva.nombre} (${reserva.personas} personas)`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;border:1px solid #e0e0e0;"><h2 style="color:#C9A84C;">Nueva reserva en Sa Terrassa</h2><table style="width:100%;border-collapse:collapse;margin-top:20px;"><tr style="background:#f5f5f5;"><td style="padding:10px;font-weight:bold;">ID</td><td style="padding:10px;">#${reserva.id}</td></tr><tr><td style="padding:10px;font-weight:bold;">Nombre</td><td style="padding:10px;">${reserva.nombre}</td></tr><tr style="background:#f5f5f5;"><td style="padding:10px;font-weight:bold;">Fecha</td><td style="padding:10px;">${reserva.fecha}</td></tr><tr><td style="padding:10px;font-weight:bold;">Hora</td><td style="padding:10px;">${reserva.hora}</td></tr><tr style="background:#f5f5f5;"><td style="padding:10px;font-weight:bold;">Personas</td><td style="padding:10px;">${reserva.personas}</td></tr><tr><td style="padding:10px;font-weight:bold;">Email</td><td style="padding:10px;">${reserva.email || '—'}</td></tr><tr style="background:#f5f5f5;"><td style="padding:10px;font-weight:bold;">Notas</td><td style="padding:10px;">${reserva.notas || '—'}</td></tr></table><p style="margin-top:20px;"><a href="https://saterrassa-backend-production.up.railway.app/admin">Ver panel de administración</a></p></div>`
    });
  } catch (error) {
    console.error('Error email restaurante:', error.message);
  }
}

// Emails Hotel Miramar
async function enviarConfirmacionHotel(reserva) {
  if (!reserva.email) return;
  try {
    await resend.emails.send({
      from: 'Hotel Miramar <onboarding@resend.dev>',
      to: reserva.email,
      subject: `✅ Reserva confirmada - Hotel Miramar #${reserva.id}`,
      html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#fff;color:#1C1C1C;padding:40px;border-top:4px solid #2D6A4F;"><h1 style="color:#2D6A4F;font-weight:400;font-style:italic;">Hotel Miramar</h1><p style="color:#6B7280;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.2em;">El Arenal, Mallorca</p><div style="border:1px solid #e5e7eb;padding:30px;margin:20px 0;border-radius:4px;"><h2 style="color:#2D6A4F;font-weight:400;">Reserva confirmada ✅</h2><p>Hola <strong>${reserva.nombre}</strong>, tu reserva ha sido confirmada.</p><table style="width:100%;border-collapse:collapse;margin-top:16px;"><tr><td style="color:#6B7280;padding:10px 0;border-bottom:1px solid #f3f4f6;">Referencia</td><td style="color:#2D6A4F;padding:10px 0;border-bottom:1px solid #f3f4f6;font-weight:500;">#HM-${reserva.id}</td></tr><tr><td style="color:#6B7280;padding:10px 0;border-bottom:1px solid #f3f4f6;">Habitación</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">${reserva.tipo_habitacion}</td></tr><tr><td style="color:#6B7280;padding:10px 0;border-bottom:1px solid #f3f4f6;">Check-in</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">${reserva.checkin}</td></tr><tr><td style="color:#6B7280;padding:10px 0;border-bottom:1px solid #f3f4f6;">Check-out</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">${reserva.checkout}</td></tr><tr><td style="color:#6B7280;padding:10px 0;">Huéspedes</td><td style="padding:10px 0;">${reserva.huespedes}</td></tr></table></div><p style="color:#6B7280;font-size:0.8rem;">Check-in: 15:00h · Check-out: 11:00h · Parking gratuito incluido<br>Para cancelar (gratuito hasta 48h antes): +34 971 XXX XXX | info@hotelmiramar.es</p></div>`
    });
  } catch (error) {
    console.error('Error email cliente hotel:', error.message);
  }
}

async function enviarNotificacionAdminHotel(reserva) {
  try {
    await resend.emails.send({
      from: 'Hotel Miramar Bot <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL,
      subject: `🔔 Nueva reserva hotel #${reserva.id} - ${reserva.nombre} (${reserva.tipo_habitacion})`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;border:1px solid #e0e0e0;border-top:4px solid #2D6A4F;"><h2 style="color:#2D6A4F;">Nueva reserva - Hotel Miramar</h2><table style="width:100%;border-collapse:collapse;margin-top:20px;"><tr style="background:#f5f5f5;"><td style="padding:10px;font-weight:bold;">ID</td><td style="padding:10px;">#HM-${reserva.id}</td></tr><tr><td style="padding:10px;font-weight:bold;">Nombre</td><td style="padding:10px;">${reserva.nombre}</td></tr><tr style="background:#f5f5f5;"><td style="padding:10px;font-weight:bold;">Email</td><td style="padding:10px;">${reserva.email || '—'}</td></tr><tr><td style="padding:10px;font-weight:bold;">Habitación</td><td style="padding:10px;">${reserva.tipo_habitacion}</td></tr><tr style="background:#f5f5f5;"><td style="padding:10px;font-weight:bold;">Check-in</td><td style="padding:10px;">${reserva.checkin}</td></tr><tr><td style="padding:10px;font-weight:bold;">Check-out</td><td style="padding:10px;">${reserva.checkout}</td></tr><tr style="background:#f5f5f5;"><td style="padding:10px;font-weight:bold;">Huéspedes</td><td style="padding:10px;">${reserva.huespedes}</td></tr><tr><td style="padding:10px;font-weight:bold;">Peticiones</td><td style="padding:10px;">${reserva.peticiones || '—'}</td></tr></table></div>`
    });
  } catch (error) {
    console.error('Error email admin hotel:', error.message);
  }
}

// ─── CLIENTE ANTHROPIC ────────────────────────────────────────────────────────

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── LÓGICA SA TERRASSA ───────────────────────────────────────────────────────

function getPersonasEnHora(fecha, hora) {
  const r = db.prepare('SELECT SUM(personas) as total FROM reservas WHERE fecha = ? AND hora = ? AND estado != ?').get(fecha, hora, 'cancelada');
  return r.total || 0;
}

function hayDisponibilidad(fecha, hora, personas) {
  return (getPersonasEnHora(fecha, hora) + personas) <= 30;
}

function crearReserva(datos) {
  const result = db.prepare('INSERT INTO reservas (nombre, telefono, email, fecha, hora, personas, ocasion, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(datos.nombre, datos.telefono || '', datos.email || '', datos.fecha, datos.hora, datos.personas, datos.ocasion || '', datos.notas || '');
  return result.lastInsertRowid;
}

const toolsRestaurante = [
  {
    name: 'comprobar_disponibilidad',
    description: 'Comprueba si hay disponibilidad para una fecha, hora y número de personas',
    input_schema: { type: 'object', properties: { fecha: { type: 'string' }, hora: { type: 'string' }, personas: { type: 'number' } }, required: ['fecha', 'hora', 'personas'] }
  },
  {
    name: 'hacer_reserva',
    description: 'Hace una reserva si hay disponibilidad',
    input_schema: { type: 'object', properties: { nombre: { type: 'string' }, telefono: { type: 'string' }, email: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, personas: { type: 'number' }, ocasion: { type: 'string' }, notas: { type: 'string' } }, required: ['nombre', 'fecha', 'hora', 'personas'] }
  },
  {
    name: 'ver_horas_disponibles',
    description: 'Muestra las horas disponibles para una fecha y número de personas',
    input_schema: { type: 'object', properties: { fecha: { type: 'string' }, personas: { type: 'number' } }, required: ['fecha', 'personas'] }
  },
  {
    name: 'cancelar_reserva',
    description: 'Cancela una reserva verificando el nombre y la fecha/hora',
    input_schema: { type: 'object', properties: { nombre: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' } }, required: ['nombre', 'fecha', 'hora'] }
  }
];

const SYSTEM_PROMPT_RESTAURANTE = `Eres el asistente virtual de Sa Terrassa, restaurante mediterráneo en El Arenal, Mallorca.
Responde SIEMPRE en el idioma del cliente.

Datos: Horario Lun-Dom 09:00-23:00. Capacidad máxima 30 personas por franja. Tel: +34 971 XXX XXX. Email: hola@saterrassa.com.

Carta: Pa amb oli (8€), Croquetas sobrasada (12€), Pulpo brasa (18€), Gazpacho (10€), Arroz langosta (38€), Lubina sal (32€), Tumbet vegetariano (20€), Fideua sepia (26€), Ensaimada (9€), Gató almendra (10€), Sorbete limón (8€), Tabla quesos (14€).

Sin gluten: tumbet, lubina, pulpo, gazpacho. CON gluten: croquetas, ensaimada. Vegetariano: tumbet, pa amb oli, gazpacho, quesos, gató, sorbete.

RESERVAS: Pide nombre, fecha, hora, personas y opcionalmente email. USA siempre las herramientas para comprobar disponibilidad y hacer reservas.
CANCELACIONES: Pide nombre completo y fecha/hora de la reserva. USA cancelar_reserva para verificar y cancelar.

Hoy es ${new Date().toISOString().split('T')[0]}. Responde amable y breve, máximo 4 líneas.`;

function processToolRestaurante(toolName, toolInput) {
  if (toolName === 'comprobar_disponibilidad') {
    const disponible = hayDisponibilidad(toolInput.fecha, toolInput.hora, toolInput.personas);
    const ocupadas = getPersonasEnHora(toolInput.fecha, toolInput.hora);
    return JSON.stringify({ disponible, personas_libres: 30 - ocupadas, mensaje: disponible ? `Hay disponibilidad: ${30 - ocupadas} plazas libres` : `No hay disponibilidad. Solo quedan ${30 - ocupadas} plazas.` });
  }
  if (toolName === 'hacer_reserva') {
    if (!hayDisponibilidad(toolInput.fecha, toolInput.hora, toolInput.personas)) return JSON.stringify({ success: false, mensaje: 'No hay disponibilidad.' });
    const id = crearReserva(toolInput);
    const reserva = { id, ...toolInput };
    enviarConfirmacionCliente(reserva);
    enviarNotificacionRestaurante(reserva);
    return JSON.stringify({ success: true, id, mensaje: `Reserva #${id} confirmada.` });
  }
  if (toolName === 'ver_horas_disponibles') {
    const horas = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30','22:00','22:30'];
    const disponibles = horas.filter(h => hayDisponibilidad(toolInput.fecha, h, toolInput.personas));
    return JSON.stringify({ horas_disponibles: disponibles, mensaje: disponibles.length > 0 ? `Horas disponibles: ${disponibles.join(', ')}` : 'No hay disponibilidad para ese día.' });
  }
  if (toolName === 'cancelar_reserva') {
    const reserva = db.prepare('SELECT * FROM reservas WHERE LOWER(nombre) = LOWER(?) AND fecha = ? AND hora = ? AND estado != ?').get(toolInput.nombre, toolInput.fecha, toolInput.hora, 'cancelada');
    if (!reserva) return JSON.stringify({ success: false, mensaje: 'No se encontró ninguna reserva con esos datos. Verifica el nombre completo y la fecha/hora.' });
    db.prepare('UPDATE reservas SET estado = ? WHERE id = ?').run('cancelada', reserva.id);
    return JSON.stringify({ success: true, mensaje: `Reserva #${reserva.id} de ${reserva.nombre} el ${reserva.fecha} a las ${reserva.hora} cancelada correctamente.` });
  }
  return JSON.stringify({ error: 'Herramienta no encontrada' });
}

// ─── LÓGICA HOTEL MIRAMAR ─────────────────────────────────────────────────────

const HABITACIONES = {
  'estandar': { nombre: 'Habitación Estándar', precio: 89, capacidad: 2 },
  'vista_mar': { nombre: 'Habitación Vista Mar', precio: 129, capacidad: 2 },
  'familiar': { nombre: 'Suite Familiar', precio: 189, capacidad: 4 }
};

const TOTAL_HABITACIONES = { estandar: 15, vista_mar: 10, familiar: 5 };

function habitacionesOcupadas(tipo, checkin, checkout) {
  const r = db.prepare(`
    SELECT COUNT(*) as total FROM reservas_hotel 
    WHERE tipo_habitacion = ? AND estado != 'cancelada'
    AND checkin < ? AND checkout > ?
  `).get(tipo, checkout, checkin);
  return r.total || 0;
}

function hayDisponibilidadHotel(tipo, checkin, checkout) {
  const tipoKey = tipo.toLowerCase().replace(/ /g, '_');
  const ocupadas = habitacionesOcupadas(tipoKey, checkin, checkout);
  const total = TOTAL_HABITACIONES[tipoKey] || 0;
  return ocupadas < total;
}

function crearReservaHotel(datos) {
  const tipoKey = datos.tipo_habitacion.toLowerCase().replace(/ /g, '_');
  const result = db.prepare('INSERT INTO reservas_hotel (nombre, email, telefono, checkin, checkout, tipo_habitacion, huespedes, peticiones) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(datos.nombre, datos.email || '', datos.telefono || '', datos.checkin, datos.checkout, tipoKey, datos.huespedes, datos.peticiones || '');
  return result.lastInsertRowid;
}

const toolsHotel = [
  {
    name: 'comprobar_disponibilidad_hotel',
    description: 'Comprueba si hay habitaciones disponibles para las fechas solicitadas',
    input_schema: {
      type: 'object',
      properties: {
        tipo_habitacion: { type: 'string', enum: ['estandar', 'vista_mar', 'familiar'], description: 'Tipo de habitación' },
        checkin: { type: 'string', description: 'Fecha de entrada en formato YYYY-MM-DD' },
        checkout: { type: 'string', description: 'Fecha de salida en formato YYYY-MM-DD' }
      },
      required: ['tipo_habitacion', 'checkin', 'checkout']
    }
  },
  {
    name: 'hacer_reserva_hotel',
    description: 'Realiza una reserva de habitación en el hotel',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        email: { type: 'string' },
        telefono: { type: 'string' },
        tipo_habitacion: { type: 'string', enum: ['estandar', 'vista_mar', 'familiar'] },
        checkin: { type: 'string' },
        checkout: { type: 'string' },
        huespedes: { type: 'number' },
        peticiones: { type: 'string' }
      },
      required: ['nombre', 'tipo_habitacion', 'checkin', 'checkout', 'huespedes']
    }
  },
  {
    name: 'cancelar_reserva_hotel',
    description: 'Cancela una reserva de hotel por nombre y fechas',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        checkin: { type: 'string' }
      },
      required: ['nombre', 'checkin']
    }
  },
  {
    name: 'ver_habitaciones_disponibles',
    description: 'Muestra qué tipos de habitación están disponibles para unas fechas',
    input_schema: {
      type: 'object',
      properties: {
        checkin: { type: 'string' },
        checkout: { type: 'string' },
        huespedes: { type: 'number' }
      },
      required: ['checkin', 'checkout']
    }
  }
];

const SYSTEM_PROMPT_HOTEL = `Eres el asistente virtual del Hotel Miramar, hotel de 3 estrellas en primera línea de playa en El Arenal, Mallorca.
Responde SIEMPRE en el idioma del cliente (español, inglés o alemán).

INFORMACIÓN DEL HOTEL:
- Dirección: Carrer de la Mar, 24, El Arenal, Mallorca
- Tel: +34 971 XXX XXX | Email: info@hotelmiramar.es
- Check-in: 15:00h | Check-out: 11:00h
- Abierto todo el año

HABITACIONES Y PRECIOS:
- Habitación Estándar (estandar): 89€/noche, hasta 2 personas, 22m², vista jardín
- Habitación Vista Mar (vista_mar): 129€/noche, hasta 2 personas, 28m², terraza privada con vistas al mar
- Suite Familiar (familiar): 189€/noche, hasta 4 personas, 48m², salón + kitchenette, ideal familias

SERVICIOS INCLUIDOS:
- Desayuno buffet (7:30-10:30h)
- Piscina exterior (mayo-octubre)
- Parking privado gratuito
- WiFi gratuito
- Acceso directo a playa (50m)
- Restaurante y bar propio
- Alquiler de bicicletas

POLÍTICA:
- Cancelación gratuita hasta 48h antes
- Mascotas no permitidas
- Fumadores: habitaciones designadas

RESERVAS: Pide nombre, email, fechas de check-in y check-out, tipo de habitación y número de huéspedes.
USA SIEMPRE las herramientas para comprobar disponibilidad antes de confirmar.

Hoy es ${new Date().toISOString().split('T')[0]}. Responde de forma amable, profesional y breve.`;

function processToolHotel(toolName, toolInput) {
  if (toolName === 'comprobar_disponibilidad_hotel') {
    const disponible = hayDisponibilidadHotel(toolInput.tipo_habitacion, toolInput.checkin, toolInput.checkout);
    const hab = HABITACIONES[toolInput.tipo_habitacion] || {};
    return JSON.stringify({
      disponible,
      tipo: hab.nombre,
      precio_noche: hab.precio,
      mensaje: disponible
        ? `Hay disponibilidad para la ${hab.nombre} a ${hab.precio}€/noche.`
        : `Lo sentimos, no hay disponibilidad para la ${hab.nombre} en esas fechas.`
    });
  }
  if (toolName === 'hacer_reserva_hotel') {
    if (!hayDisponibilidadHotel(toolInput.tipo_habitacion, toolInput.checkin, toolInput.checkout)) {
      return JSON.stringify({ success: false, mensaje: 'No hay disponibilidad para esas fechas. ¿Quieres que compruebe otras fechas u otro tipo de habitación?' });
    }
    const id = crearReservaHotel(toolInput);
    const reserva = { id, ...toolInput };
    enviarConfirmacionHotel(reserva);
    enviarNotificacionAdminHotel(reserva);
    return JSON.stringify({ success: true, id, mensaje: `Reserva #HM-${id} confirmada. Recibirás confirmación por email en breve.` });
  }
  if (toolName === 'cancelar_reserva_hotel') {
    const reserva = db.prepare('SELECT * FROM reservas_hotel WHERE LOWER(nombre) = LOWER(?) AND checkin = ? AND estado != ?').get(toolInput.nombre, toolInput.checkin, 'cancelada');
    if (!reserva) return JSON.stringify({ success: false, mensaje: 'No se encontró ninguna reserva con esos datos. Verifica el nombre y la fecha de check-in.' });
    db.prepare('UPDATE reservas_hotel SET estado = ? WHERE id = ?').run('cancelada', reserva.id);
    return JSON.stringify({ success: true, mensaje: `Reserva #HM-${reserva.id} de ${reserva.nombre} cancelada correctamente.` });
  }
  if (toolName === 'ver_habitaciones_disponibles') {
    const resultados = Object.entries(HABITACIONES).map(([key, hab]) => {
      const disponible = hayDisponibilidadHotel(key, toolInput.checkin, toolInput.checkout);
      const apta = !toolInput.huespedes || hab.capacidad >= toolInput.huespedes;
      return { tipo: key, nombre: hab.nombre, precio: hab.precio, capacidad: hab.capacidad, disponible: disponible && apta };
    }).filter(h => h.disponible);
    return JSON.stringify({
      disponibles: resultados,
      mensaje: resultados.length > 0
        ? `Habitaciones disponibles: ${resultados.map(h => `${h.nombre} (${h.precio}€/noche)`).join(', ')}`
        : 'No hay habitaciones disponibles para esas fechas.'
    });
  }
  return JSON.stringify({ error: 'Herramienta no encontrada' });
}

// ─── FUNCIÓN GENÉRICA DE CHAT ─────────────────────────────────────────────────

async function procesarChat(messages, systemPrompt, tools, processTool) {
  let currentMessages = [...messages];
  let response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: systemPrompt,
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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: systemPrompt,
      tools,
      messages: currentMessages
    });
  }

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock ? textBlock.text : 'Lo siento, ha habido un error.';
}

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────

// Chat Sa Terrassa
app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const reply = await procesarChat(messages, SYSTEM_PROMPT_RESTAURANTE, toolsRestaurante, processToolRestaurante);
    res.json({ reply });
  } catch (error) {
    console.error('Error chat restaurante:', error.message);
    res.status(500).json({ error: 'Error al conectar con la IA' });
  }
});

// Chat Hotel Miramar
app.post('/hotel/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const reply = await procesarChat(messages, SYSTEM_PROMPT_HOTEL, toolsHotel, processToolHotel);
    res.json({ reply });
  } catch (error) {
    console.error('Error chat hotel:', error.message);
    res.status(500).json({ error: 'Error al conectar con la IA' });
  }
});

// Admin Sa Terrassa
app.get('/admin/reservas', (req, res) => res.json(db.prepare('SELECT * FROM reservas ORDER BY fecha, hora').all()));
app.patch('/admin/reservas/:id/cancelar', (req, res) => {
  db.prepare('UPDATE reservas SET estado = ? WHERE id = ?').run('cancelada', req.params.id);
  res.json({ success: true });
});

// Admin Hotel Miramar
app.get('/hotel/admin/reservas', (req, res) => res.json(db.prepare('SELECT * FROM reservas_hotel ORDER BY checkin').all()));
app.patch('/hotel/admin/reservas/:id/cancelar', (req, res) => {
  db.prepare('UPDATE reservas_hotel SET estado = ? WHERE id = ?').run('cancelada', req.params.id);
  res.json({ success: true });
});

// Páginas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/hotel', (req, res) => res.sendFile(path.join(__dirname, 'hotel-miramar.html')));
app.get('/hotel/admin', (req, res) => res.sendFile(path.join(__dirname, 'hotel-admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Sa Terrassa:   http://localhost:${PORT}/`);
  console.log(`   Hotel Miramar: http://localhost:${PORT}/hotel`);
});
