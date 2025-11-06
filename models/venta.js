import mongoose from 'mongoose';

const VentaItemSchema = new mongoose.Schema({
    productoID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Producto',
        required: true,
    },
    nombre: {
        type: String,
        required: true,
    },
    precioUnitario: {
        type: Number,
        required: true,
    },
    cantidad: {
        type: Number,
        required: true,
    },
    subtotal: {
        type: Number,
        required: true,
    },
});

const VentaSchema = new mongoose.Schema({
    productosVendidos: [VentaItemSchema], // Array de los productos vendidos
    totalVenta: {
        type: Number,
        required: true,
    },
    fechaVenta: {
        type: Date,
        default: Date.now, // Fecha de registro de la venta
    }
}, {
    timestamps: true // Agrega createdAt y updatedAt
});

const Venta = mongoose.model('Venta', VentaSchema);
export default Venta;
