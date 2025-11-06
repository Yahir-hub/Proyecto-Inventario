import mongoose from 'mongoose';

const productoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: [true, 'El nombre del producto es obligatorio.'],
        trim: true
    },
    precio: {
        type: Number,
        required: [true, 'El precio es obligatorio.'],
        min: [0, 'El precio debe ser un número positivo.']
    },
    cantidad: {
        type: Number,
        required: [true, 'La cantidad es obligatoria.'],
        min: [0, 'La cantidad no puede ser negativa.'],
        default: 0
    },
    // Relación uno a muchos
    categoriaID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Categoria', // Referencia al modelo Categoria
        required: [true, 'La categoría del producto es obligatoria.']
    }
}, {
    timestamps: true
});

// Índice para mejorar el rendimiento de búsqueda por nombre
productoSchema.index({ nombre: 1 });

const Producto = mongoose.model('Producto', productoSchema);

export default Producto;