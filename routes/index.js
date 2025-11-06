import { Router } from 'express';
import mongoose from 'mongoose'; // Necesario para transacciones (session)
import Producto from '../models/Producto.js';
import Categoria from '../models/Categoria.js';
import Venta from '../models/venta.js'; // Importar el modelo de Venta

const router = Router();

// =================================================================
// LÓGICA DE NEGOCIO: CÁLCULOS AGREGADOS
// =================================================================

/**
 * Calcula la suma total de existencias por cada categoría.
 */
const calcularExistenciasPorCategoria = async () => {
    try {
        const existencias = await Producto.aggregate([
            { $group: { _id: '$categoriaID', totalExistencias: { $sum: '$cantidad' } } },
            { 
                $lookup: {
                    from: 'categorias', // Nombre de la colección en MongoDB
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
        console.error("Error al calcular existencias por categoría:", error);
        return [];
    }
};

/**
 * Calcula el total vendido histórico sumando todas las ventas registradas.
 */
const calcularTotalVendido = async () => {
    try {
        const resultado = await Venta.aggregate([
            { $group: { _id: null, totalGlobal: { $sum: '$totalVenta' } } }
        ]);
        return resultado.length > 0 ? resultado[0].totalGlobal : 0;
    } catch (error) {
        console.error("Error al calcular el total vendido:", error);
        return 0;
    }
};


// =================================================================
// RUTA PRINCIPAL (HOME)
// =================================================================
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
        res.status(500).send('Error al cargar la página principal: ' + error.message);
    }
});

// =================================================================
// RUTAS DE VENTAS (CARRITO y VENTA RÁPIDA)
// =================================================================

// LÓGICA DE NEGOCIO: Finalizar Compra y Actualizar Stock (Ruta POST para Carrito)
router.post('/ventas/finalizar', async (req, res) => {
    const cart = req.body.cart;
    
    if (!cart || cart.length === 0) {
        return res.status(400).json({ error: 'El carrito está vacío.' });
    }
    // [Se mantiene la lógica completa de validación y transacción para el carrito]
    // ... (El código de Finalizar Compra es extenso y se mantiene sin cambios)
    
    let totalVenta = 0;
    let productosVendidos = [];

    // 1. Fase de Validación: Verificar Stock
    try {
        for (const item of cart) {
            const producto = await Producto.findById(item.id);

            if (!producto) {
                return res.status(404).json({ error: `Producto con ID ${item.id} no encontrado.` });
            }

            if (producto.cantidad < item.cantidad) {
                return res.status(400).json({ error: `Stock insuficiente para ${producto.nombre}. Solo hay ${producto.cantidad} unidades.` });
            }
            
            productosVendidos.push({
                productoID: producto._id,
                nombre: producto.nombre,
                precioUnitario: producto.precio,
                cantidad: item.cantidad,
                subtotal: item.cantidad * producto.precio
            });
            totalVenta += item.cantidad * producto.precio;
        }

        // 2. Fase de Transacción: Reducción de Stock y Registro de Venta
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            for (const item of cart) {
                await Producto.findByIdAndUpdate(item.id, { 
                    $inc: { cantidad: -item.cantidad } 
                }, { session });
            }

            const nuevaVenta = new Venta({
                productosVendidos: productosVendidos,
                totalVenta: totalVenta
            });
            await nuevaVenta.save({ session });

            await session.commitTransaction();
            session.endSession();

            return res.json({ success: true, message: `Venta finalizada con éxito por $${totalVenta.toFixed(2)}` });

        } catch (transactionError) {
            await session.abortTransaction();
            session.endSession();
            console.error("Error en la transacción de venta:", transactionError);
            return res.status(500).json({ error: 'Error al ejecutar la transacción de venta.' });
        }

    } catch (error) {
        console.error("Error general en el proceso de venta:", error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

router.post('/productos/actualizar-stock/:id', async (req, res) => {
    const productoId = req.params.id;
    // Aseguramos que la cantidad sea un número entero
    const nuevoStock = parseInt(req.body.cantidad, 10); 

    // Validación básica de la entrada
    if (isNaN(nuevoStock) || nuevoStock < 0) {
        return res.redirect(`/?err=El stock debe ser un número positivo.`);
    }

    try {
        // Busca el producto por ID y actualiza su campo 'cantidad'
        const productoActualizado = await Producto.findByIdAndUpdate(
            productoId,
            { cantidad: nuevoStock }, // El nuevo valor de stock
            { new: true, runValidators: true } // new: true devuelve el documento actualizado
        );

        if (!productoActualizado) {
            return res.redirect(`/?err=Producto no encontrado para actualizar stock.`);
        }

        res.redirect(`/?msg=Stock de "${productoActualizado.nombre}" actualizado a ${nuevoStock}.`);

    } catch (error) {
        console.error("Error al actualizar el stock:", error);
        res.redirect(`/?err=Error al actualizar el stock: ${error.message}`);
    }
});

// LÓGICA DE NEGOCIO: Venta Rápida (Formulario directo en la tabla) - ¡MODIFICADO PARA AJAX!
router.post('/productos/vender/:id', async (req, res) => {
    const productoId = req.params.id;
    const cantidadVenta = parseInt(req.body.cantidad, 10);

    // Validación de entrada
    if (isNaN(cantidadVenta) || cantidadVenta <= 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'La cantidad debe ser un número mayor a cero.' 
        });
    }

    try {
        const producto = await Producto.findById(productoId);

        if (!producto) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado.' });
        }
        
        // Validación de stock
        if (producto.cantidad < cantidadVenta) {
            return res.status(400).json({ 
                success: false, 
                error: `Stock insuficiente. Solo hay ${producto.cantidad} unidades.` 
            });
        }

        // Registrar la venta y reducir stock
        const totalVenta = producto.precio * cantidadVenta;
        
        const nuevaVenta = new Venta({
            productosVendidos: [{
                productoID: producto._id,
                nombre: producto.nombre,
                precioUnitario: producto.precio,
                cantidad: cantidadVenta,
                subtotal: totalVenta
            }],
            totalVenta: totalVenta
        });
        await nuevaVenta.save(); // Guarda la venta

        producto.cantidad -= cantidadVenta;
        await producto.save(); // Actualiza el stock del producto

        // Éxito: Devolvemos el producto actualizado y un mensaje
        res.json({ 
            success: true, 
            mensaje: `Venta de ${cantidadVenta} unidades registrada.`,
            productoActualizado: producto // Enviamos el producto con el nuevo stock
        });

    } catch (error) {
        // Error general del servidor
        console.error("Error en venta rápida:", error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno del servidor. ' + error.message 
        });
    }
});


// =================================================================
// RUTAS DE PRODUCTOS (CRUD y Buscador) - Se mantienen sin cambios
// =================================================================

// BUSCADOR DINÁMICO (FETCH API)
router.get('/productos/buscar', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);

    try {
        const productos = await Producto.find({
            nombre: { $regex: query, $options: 'i' }
        })
        .limit(10) 
        .populate('categoriaID', 'nombre') 
        .lean();

        res.json(productos);
    } catch (error) {
        console.error("Error en la búsqueda dinámica:", error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// CRUD: Crear Producto (GET Formulario)
router.get('/productos/crear', async (req, res) => {
    try {
        const categorias = await Categoria.find().lean();
        res.render('productos/crear_producto', { categorias, producto: null, errores: null });
    } catch (error) {
        res.redirect(`/?err=Error al cargar el formulario de producto: ${error.message}`);
    }
});

// CRUD: Crear Producto (POST Guardar)
router.post('/productos/crear', async (req, res) => {
    try {
        const nuevoProducto = new Producto(req.body);
        await nuevoProducto.save();
        res.redirect(`/?msg=Producto "${nuevoProducto.nombre}" creado con éxito.`);
    } catch (error) {
        const categorias = await Categoria.find().lean();
        res.render('productos/crear_producto', { 
            categorias,
            errores: error.errors,
            producto: req.body 
        });
    }
});

// CRUD: Eliminar Producto
router.post('/productos/eliminar/:id', async (req, res) => {
    try {
        const productoEliminado = await Producto.findByIdAndDelete(req.params.id);
        if (!productoEliminado) return res.redirect(`/?err=Producto no encontrado.`);
        res.redirect(`/?msg=Producto "${productoEliminado.nombre}" eliminado correctamente.`);
    } catch (error) {
        res.redirect(`/?err=Error al eliminar el producto: ${error.message}`);
    }
});

// =================================================================
// RUTAS DE CATEGORIAS (CRUD) - Se mantienen sin cambios
// =================================================================

// CRUD: Listar Categorías
router.get('/categorias', async (req, res) => {
    try {
        const categorias = await Categoria.find().lean();
        res.render('categorias/listado_categorias', { 
            categorias,
            mensaje: req.query.msg || null,
            error: req.query.err || null
        });
    } catch (error) {
        res.status(500).send('Error al cargar categorías: ' + error.message);
    }
});

// CRUD: Crear Categoría (GET Formulario)
router.get('/categorias/crear', (req, res) => {
    res.render('categorias/crear_categoria', { error: null, categoria: null });
});

// CRUD: Crear Categoría (POST Guardar)
router.post('/categorias/crear', async (req, res) => {
    try {
        const nuevaCategoria = new Categoria(req.body);
        await nuevaCategoria.save();
        res.redirect(`/categorias?msg=Categoría "${nuevaCategoria.nombre}" creada.`);
    } catch (error) {
        let errorMessage = 'Error al crear la categoría. El nombre podría estar duplicado o es inválido.';
        if (error.code === 11000) errorMessage = 'El nombre de la categoría ya existe. Debe ser único.';
        
        res.render('categorias/crear_categoria', { 
            error: errorMessage,
            categoria: req.body 
        });
    }
});

// CRUD: Eliminar Categoría
router.post('/categorias/eliminar/:id', async (req, res) => {
    try {
        const categoriaEliminada = await Categoria.findByIdAndDelete(req.params.id);
        if (!categoriaEliminada) return res.redirect(`/?err=Categoría no encontrada.`);
        res.redirect(`/categorias?msg=Categoría "${categoriaEliminada.nombre}" eliminada correctamente.`);
    } catch (error) {
        res.redirect(`/categorias?err=Error al eliminar la categoría: ${error.message}`);
    }
});



export default router;
