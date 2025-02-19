//Exportación de librerías necesarias
import express from 'express'
import session from 'express-session'
import { v4 as uuidv4 } from 'uuid'; //versión 4 de uuid
import os, { networkInterfaces } from 'os';
import moment from 'moment-timezone';
import './database.js';
import Session from './Session.js';

const sessions = new Map();

const app = express();
const PORT = 3500;


app.use(express.json());
app.use(express.urlencoded({extended: true}));

//Sesiones almacenadas en Memoria(RAM) - Cuando Express cae, todo cae.


app.use(
    session({
        secret: "P4-DJBG#Soundwave-SesionesHTTP-VariablesDeSesion",
        resave: false,
        saveUninitialized: false,
        cookie: {maxAge: 5* 60 * 1000 } //mil milisegundos
    })
)



const getCDMXDateTime = () => {
    return moment().tz('America/Mexico_City').format('DD-MM-YYYY HH:mm:ss');
};

const calculateInactivityTime = (lastAccesed) => {
    try {
        const now = moment().tz('America/Mexico_City').tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss');
        const lastAccess = moment.tz(lastAccesed, 'DD-MM-YYYY HH:mm:ss', 'America/Mexico_City');
        
        const diff = moment.duration(now.diff(lastAccess));
        
        const hours = Math.floor(diff.asHours()) % 24;
        const minutes = diff.minutes();
        const seconds = diff.seconds();
        
        return {
            hours,
            minutes,
            seconds,
            formatted: `${hours}h ${minutes}m ${seconds}s`
        };
    } catch (error) {
        console.error('Error calculating inactivity time:', error);
        return {
            hours: 0,
            minutes: 0,
            seconds: 0,
            formatted: '0h 0m 0s'
        };
    }
};

const getServerInfo = () => {
    const networkInterfaces = os.networkInterfaces();
    let serverInfo = {
        ip: null,
        mac: null
    };

    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        for (const iface of interfaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                serverInfo.ip = iface.address;
                serverInfo.mac = iface.mac;
                return serverInfo;
            }
        }
    }
    return serverInfo;
};

const getClientInfo = (req) => {
    let clientIP = req.ip || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress || 
                  req.connection.socket?.remoteAddress || 
                  '0.0.0.0';
    
    if (clientIP === '::1' || clientIP === '127.0.0.1') {
        const serverInfo = getServerInfo();
        clientIP = serverInfo.ip;
    }
    
    if (clientIP.includes('::ffff:')) {
        clientIP = clientIP.replace('::ffff:', '');
    }

    return {
        ip: clientIP
    };
};

app.get('/', (req, res) => {
    return res.status(200).json({
        message: "Ésta es la API de Control de Sesiones", 
        author: "Daniel de Jesús Bravo Godínez"
    });
});

app.post('/login', async (req, res) => {
    try {
        const {email, nickname, macAddress} = req.body;

        if(!email || !nickname || !macAddress) {
            return res.status(400).json({message: "Se esperan campos requeridos"});
        }

        const serverInfo = getServerInfo();
        const clientInfo = getClientInfo(req);

        const currentTime = getCDMXDateTime();
        const sessionData = {
            sessionId: uuidv4(),
            email,
            nickname,
            clientInfo: {
                ip: clientInfo.ip,
                mac: macAddress
            },
            serverInfo: {
                ip: serverInfo.ip,
                mac: serverInfo.mac
            },
            status: 'Activa',
            lastAccesed: currentTime,
            createdAt: currentTime,
            updatedAt: currentTime
        };

        const session = new Session(sessionData);
        await session.save();

        req.session.userSession = session;

        res.status(200).json({
            message: "Se ha logueado exitosamente",
            session
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({message: "Error al crear la sesión", error: error.message});
    }
});

app.post("/logout", async (req, res) => {
    try {
        const { sessionId } = req.body;

        const session = await Session.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({message: "No se ha encontrado una sesión activa."});
        }

        session.status = 'Finalizada';
        session.lastAccesed = getCDMXDateTime();
        await session.save();

        req.session.destroy((err) => {
            if(err) {
                return res.status(500).json({message: 'Error al cerrar sesión'});
            }
            res.status(200).json({message: "Logout successful"});
        });
    } catch (error) {
        console.error('Error en logout:', error);
        res.status(500).json({message: "Error al cerrar sesión", error: error.message});
    }
});

app.put("/update", async (req, res) => {
    try {
        const { sessionId } = req.body;

        const session = await Session.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({message: "No existe una sesión activa"});
        }

        const serverInfo = getServerInfo();
        const clientInfo = getClientInfo(req);
        const currentTime = getCDMXDateTime();

        session.clientInfo.ip = clientInfo.ip;
        session.serverInfo = {
            ip: serverInfo.ip,
            mac: serverInfo.mac
        };
        session.status = 'Activa';
        session.lastAccesed = currentTime;

        await session.save();

        return res.status(200).json({
            message: "Sesión actualizada correctamente",
            session
        });
    } catch (error) {
        console.error('Error en update:', error);
        res.status(500).json({message: "Error al actualizar la sesión", error: error.message});
    }
});

app.get("/status", async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({message: "Se requiere un sessionId"});
        }
        
        const session = await Session.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({message: "No se encontró la sesión"});
        }

        //Solo obtiene la información actual del servidor y cliente sin modificar la sesión
        const serverInfo = getServerInfo();
        const clientInfo = getClientInfo(req);
        
        //Calcula tiempo de inactividad
        const inactivityTime = calculateInactivityTime(session.lastAccesed);

        //Crea una copia de la sesión para la respuesta
        const sessionResponse = {
            ...session.toObject(),
            serverInfo,
            clientInfo: {
                ...session.clientInfo,
                ip: clientInfo.ip
            },
            inactivityTime
        };
        
        return res.status(200).json({
            message: "Sesión encontrada",
            session: sessionResponse
        });
    } catch (error) {
        console.error('Error en status:', error);
        res.status(500).json({message: "Error al obtener el estado de la sesión", error: error.message});
    }
});

app.get("/listCurrentSessions", async (req, res) => {
    try {
        const activeSessions = await Session.find({ status: 'Activa' });

        if (activeSessions.length === 0) {
            return res.status(200).json({
                message: "No hay sesiones activas",
                count: 0,
                sessions: []
            });
        }

        const serverInfo = getServerInfo();
        const clientInfo = getClientInfo(req);
        const currentTime = getCDMXDateTime();

        const updatedSessions = activeSessions.map(session => {
            const sessionObj = session.toObject();
            sessionObj.clientInfo.ip = clientInfo.ip;
            sessionObj.serverInfo = serverInfo;
            sessionObj.inactivityTime = calculateInactivityTime(session.lastAccesed);
            return sessionObj;
        });

        return res.status(200).json({
            message: "Sesiones activas encontradas",
            count: updatedSessions.length,
            sessions: updatedSessions
        });
    } catch (error) {
        console.error('Error en listCurrentSessions:', error);
        res.status(500).json({message: "Error al listar las sesiones", error: error.message});
    }
});



app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
    const serverInfo = getServerInfo();
    console.log(`Información del servidor:`, serverInfo);
});


export default app;