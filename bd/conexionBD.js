import mongoose from 'mongoose';

const conectarDB = async () => {
    // BUENO: Lee la variable de entorno
    const MONGODB_URI = process.env.MONGODB_URI; 

    try {
        const conexion = await mongoose.connect(MONGODB_URI);
        
        // Muestra el nombre del host o la base de datos conectada.
        console.log(`MongoDB Conectada a la base de datos: ${conexion.connection.name}`); 
    } catch (error) {
        console.error(`Error crítico de conexión a la base de datos: ${error.message}`);
        // Salir del proceso en caso de fallo crítico
        process.exit(1); 
    }
};

export default conectarDB;


/*
import mongoose from "mongoose";
async function connectBD() {
  
try {
   const respuestaMongo=await mongoose.connect("mongodb+srv://root:hola123@cluster0.k10picg.mongodb.net/?retryWrites=true&w=majority&appName=TAREA2")
    console.log("Conectado a la BD", respuestaMongo.connection.name)
}  catch (error) {
  console.log("Error de conexion a la BD", error)
} 
  }
export default connectBD

*/ 
