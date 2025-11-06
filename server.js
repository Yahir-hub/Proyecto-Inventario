import express from 'express';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config'; 
import conectarDB from './bd/conexionBD.js';
import mainRouter from './routes/index.js';

// Configuración de rutas de archivos
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Conectar a la base de datos
conectarDB();

// Inicialización de Express
const app = express();
const PORT = process.env.PORT || 3100;

// Configuración de EJS y Vistas
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views'); // Carpeta de vistas
app.set('title', 'Sistema de Inventario');

// Middleware
app.use(express.urlencoded({ extended: true })); // Para formularios
app.use(express.json()); // Para peticiones API como el buscador
app.use(express.static('public')); // Para archivos estáticos

// Rutas principales
app.use('/', mainRouter);

// Servidor
app.listen(PORT, () => {
    console.log(`Servidor de Inventario escuchando en http://localhost:${PORT}`);
    console.log('Presiona Ctrl+C para detener el servidor.');
});