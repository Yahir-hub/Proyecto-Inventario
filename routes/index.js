import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Modelos (Asegúrate de que los archivos en la carpeta models estén en minúsculas)
import Producto from '../models/producto.js';
import Categoria from '../models/categoria.js';
import Venta from '../models/venta.js';
import Usuario from '../models/usuario.js'; 
import { requireAuth, requireAdmin } from '../middleware/auth.js';

// Configuración para rutas de archivos (ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// =================================================================
// CONFIGURACIÓN DE MULTER (SUBIDA DE FOTOS)
// =================================================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // La carpeta public/uploads debe existir
        cb(null, 'public/uploads/'); 
    },
    filename: function (req, file, cb) {
        // Genera nombre único: fecha-random.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// =================================================================
// LÓGICA DE NEGOCIO (Funciones Auxiliares)
// =================================================================
const calcularExistenciasPorCategoria = async () => {
    try {
        const existencias = await Producto.aggregate([
            { $group: { _id: '$categoriaID', totalExistencias: { $sum: '$cantidad' } } },
            { 
                $lookup: {
                    from: 'categorias',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'categoriaInfo'
                }
            },
            { $unwind: '$categoriaInfo' }, 
            { $project: { _id: 1, nombre: '$categoriaInfo.nombre', totalExistencias: 1 } }
        ]);
        return existencias;
    } catch (error) {
        console.error("Error al calcular existencias:", error);
        return [];
    }
};

const calcularTotalVendido = async () => {
    try {
        const resultado = await Venta.aggregate([
            { $group: { _id: null, totalGlobal: { $sum: '$totalVenta' } } }
        ]);
        return resultado.length > 0 ? resultado[0].totalGlobal : 0;
    } catch (error) {
        return 0;
    }
};


// =================================================================
// RUTAS DE USUARIOS Y PERFIL
// =================================================================

// SETUP: Crear primer admin (Solo usar una vez)
router.get('/setup', async (req, res) => {
    try {
        const existeAdmin = await Usuario.findOne({ username: 'admin' });
        if (existeAdmin) return res.send('El usuario admin ya existe.');

        const hash = bcrypt.hashSync('admin123', 10);
        const admin = new Usuario({
            username: 'admin',
            password: hash,
            name: 'Administrador Principal',
            role: 'administrador',
            fotoPerfil: 'default.png'
        });
        await admin.save();
        res.send('Admin creado (usuario: admin / pass: admin123). <a href="/login">Ir a Login</a>');
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

// Login
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await Usuario.findOne({ username });
        
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.render('login', { error: 'Usuario o contraseña incorrectos' });
        }
        
        // Guardar datos en sesión
        req.session.user = {
            id: user._id,
            username: user.username,
            name: user.name,
            role: user.role,
            fotoPerfil: user.fotoPerfil
        };
        res.redirect('/dashboard');
    } catch (error) {
        res.render('login', { error: 'Error interno del servidor' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// Ver Perfil
router.get('/perfil', requireAuth, async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.session.user.id);
        res.render('perfil', { usuario });
    } catch (error) {
        res.redirect('/dashboard');
    }
});

// Actualizar Perfil (Foto y Nombre)
router.post('/perfil/actualizar', requireAuth, upload.single('foto'), async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.session.user.id);
        
        // Si subió foto nueva
        if (req.file) {
            // Borrar física anterior si no es default
            if (usuario.fotoPerfil && usuario.fotoPerfil !== 'default.png') {
                const rutaAnterior = path.join(__dirname, '../public/uploads', usuario.fotoPerfil);
                if (fs.existsSync(rutaAnterior)) fs.unlinkSync(rutaAnterior);
            }
            usuario.fotoPerfil = req.file.filename;
        }

        if(req.body.name) usuario.name = req.body.name;

        await usuario.save();
        
        // Actualizar sesión
        req.session.user.name = usuario.name;
        req.session.user.fotoPerfil = usuario.fotoPerfil;

        res.redirect('/perfil?msg=Perfil actualizado');
    } catch (error) {
        console.error(error);
        res.redirect('/perfil?err=Error al actualizar');
    }
});

// NUEVA RUTA: Eliminar foto de perfil (volver a default)
router.post('/perfil/eliminar-foto', requireAuth, async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.session.user.id);
        
        if (usuario.fotoPerfil && usuario.fotoPerfil !== 'default.png') {
            const rutaFoto = path.join(__dirname, '../public/uploads', usuario.fotoPerfil);
            
            // Borrar archivo físico
            if (fs.existsSync(rutaFoto)) {
                fs.unlinkSync(rutaFoto);
            }
            
            // Resetear en BD
            usuario.fotoPerfil = 'default.png'; 
            await usuario.save();
            
            // Actualizar sesión
            req.session.user.fotoPerfil = 'default.png';
        }
        
        res.redirect('/perfil?msg=Foto eliminada correctamente');
    } catch (error) {
        console.error(error);
        res.redirect('/perfil?err=Error al eliminar foto');
    }
});


// =================================================================
// RUTAS PRINCIPALES (DASHBOARD, ADMIN Y HOME)
// =================================================================

router.get('/dashboard', requireAuth, (req, res) => {
    res.render('dashboard', { title: 'Dashboard' });
});

router.get('/admin/panel', requireAuth, requireAdmin, (req, res) => {
    res.render('admin/panel', { title: 'Panel de Administración' });
});

// Eliminar usuario (Admin)
router.post('/admin/eliminar-usuario/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const usuarioEliminar = await Usuario.findById(req.params.id);
        if (!usuarioEliminar) return res.redirect('/admin/panel?err=No encontrado');

        // Borrar foto física del usuario eliminado
        if (usuarioEliminar.fotoPerfil && usuarioEliminar.fotoPerfil !== 'default.png') {
            const ruta = path.join(__dirname, '../public/uploads', usuarioEliminar.fotoPerfil);
            if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
        }
        
        await Usuario.findByIdAndDelete(req.params.id);
        res.redirect('/admin/panel?msg=Usuario eliminado');
    } catch (error) {
        res.redirect('/admin/panel?err=Error eliminando usuario');
    }
});

// RUTA PRINCIPAL (HOME)
router.get('/', async (req, res) => {
    try {
        const productos = await Producto.find().populate('categoriaID').lean();
        const existenciasPorCategoria = await calcularExistenciasPorCategoria();
        const totalVendido = await calcularTotalVendido(); 

        const existenciasMap = existenciasPorCategoria.reduce((acc, curr) => {
            acc[curr.nombre] = curr.totalExistencias;
            return acc;
        }, {});

        res.render('index', { 
            productos,
            existencias: existenciasMap,
            totalVendido: totalVendido,
            mensaje: req.query.msg || null, 
            error: req.query.err || null
        });
    } catch (error) {
        res.status(500).send('Error al cargar home: ' + error.message);
    }
});


// =================================================================
// RUTAS DE PRODUCTOS, VENTAS Y CATEGORÍAS
// =================================================================

router.post('/ventas/finalizar', async (req, res) => {
    // Aquí iría la lógica completa del carrito si la tienes aparte
    return res.status(501).json({ error: 'Funcionalidad pendiente' });
});

router.post('/productos/actualizar-stock/:id', async (req, res) => {
    const nuevoStock = parseInt(req.body.cantidad, 10); 
    if (isNaN(nuevoStock) || nuevoStock < 0) return res.redirect(`/?err=Stock inválido`);
    
    try {
        await Producto.findByIdAndUpdate(req.params.id, { cantidad: nuevoStock });
        res.redirect(`/?msg=Stock actualizado`);
    } catch (error) {
        res.redirect(`/?err=Error: ${error.message}`);
    }
});

router.post('/productos/vender/:id', async (req, res) => {
    const cantidad = parseInt(req.body.cantidad, 10);
    if (isNaN(cantidad) || cantidad <= 0) return res.redirect(`/?err=Cantidad inválida`);

    try {
        const producto = await Producto.findById(req.params.id);
        if (!producto || producto.cantidad < cantidad) return res.redirect(`/?err=Stock insuficiente`);

        const total = producto.precio * cantidad;
        
        const nuevaVenta = new Venta({
            productosVendidos: [{
                productoID: producto._id,
                nombre: producto.nombre,
                precioUnitario: producto.precio,
                cantidad: cantidad,
                subtotal: total
            }],
            totalVenta: total
        });
        await nuevaVenta.save();

        producto.cantidad -= cantidad;
        await producto.save();

        res.redirect(`/?msg=Venta registrada. Total: $${total.toFixed(2)}`);
    } catch (error) {
        res.redirect(`/?err=Error venta: ${error.message}`);
    }
});

router.get('/productos/buscar', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);
    try {
        const productos = await Producto.find({ nombre: { $regex: query, $options: 'i' } })
        .limit(10).populate('categoriaID', 'nombre').lean();
        res.json(productos);
    } catch (e) { res.status(500).json({error: 'Error'}); }
});

// CRUD Productos
router.get('/productos/crear', requireAuth, async (req, res) => {
    try {
        const categorias = await Categoria.find().lean();
        res.render('productos/crear_producto', { categorias, producto: null, errores: null });
    } catch (e) { res.redirect(`/?err=Error carga`); }
});

router.post('/productos/crear', requireAuth, async (req, res) => {
    try {
        await new Producto(req.body).save();
        res.redirect(`/?msg=Producto creado`);
    } catch (error) {
        const categorias = await Categoria.find().lean();
        res.render('productos/crear_producto', { categorias, errores: error.errors, producto: req.body });
    }
});

router.post('/productos/eliminar/:id', requireAuth, async (req, res) => {
    try {
        await Producto.findByIdAndDelete(req.params.id);
        res.redirect(`/?msg=Producto eliminado`);
    } catch (e) { res.redirect(`/?err=Error eliminar`); }
});

// CRUD Categorías
router.get('/categorias', requireAuth, async (req, res) => {
    try {
        const categorias = await Categoria.find().lean();
        res.render('categorias/listado_categorias', { categorias, mensaje: req.query.msg, error: req.query.err });
    } catch (e) { res.status(500).send('Error'); }
});

router.get('/categorias/crear', requireAuth, (req, res) => {
    res.render('categorias/crear_categoria', { error: null, categoria: null });
});

router.post('/categorias/crear', requireAuth, async (req, res) => {
    try {
        await new Categoria(req.body).save();
        res.redirect(`/categorias?msg=Categoría creada`);
    } catch (error) {
        res.render('categorias/crear_categoria', { error: 'Error o duplicado', categoria: req.body });
    }
});

router.post('/categorias/eliminar/:id', requireAuth, async (req, res) => {
    try {
        await Categoria.findByIdAndDelete(req.params.id);
        res.redirect(`/categorias?msg=Eliminada`);
    } catch (e) { res.redirect(`/categorias?err=Error`); }
});

export default router;
