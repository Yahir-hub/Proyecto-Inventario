import mongoose from 'mongoose';

const usuarioSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // En un caso real, esto iría encriptado
    name: { type: String, required: true },
    role: { type: String, enum: ['administrador', 'normal'], default: 'normal' },
    fotoPerfil: { type: String, default: 'default.png' } // Aquí guardaremos el nombre del archivo
}, { timestamps: true });

const Usuario = mongoose.model('Usuario', usuarioSchema);
export default Usuario;