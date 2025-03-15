// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {}; // Aktif odaları tutan nesne
const socketUsernameMap = {}; // Socket ID - Kullanıcı Adı eşleştirmesi için obje EKLENDİ

app.use('/public', express.static(path.join(__dirname, 'public'))); // **DÜZELTME: public klasörüne /public yolu ile erişim**
app.use(express.static(path.join(__dirname, 'public'))); // Redundant line removed
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public' , 'AnaPageTanıtım' , 'home.html')); // Ana sayfayı gönder
});

app.get('/public/kayıtPage/kayıt.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kayıtPage', 'kayıt.html')); // kayıt.html sayfasını gönder
});
app.get('/public/MesajPage/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'MesajPage', 'index.html')); // Mesaj sayfası index.html'i gönder
});


// Socket.IO bağlantı olayları
io.on('connection', (socket) => {
    console.log('Yeni kullanıcı bağlandı: ' + socket.id);

    // Oda Oluşturma
    socket.on('createRoom', (data) => {
        const { roomId, capacity, password } = data; // Şifreyi al EKLENDİ
        // Kullanıcı adını istemciden almalısın. Şimdilik varsayılan bir değer kullanıyorum
        const username = socketUsernameMap[socket.id] || "Bilinmeyen Kullanıcı";

        if (rooms[roomId]) {
            socket.emit('roomError', 'Bu oda zaten mevcut.'); // Oda zaten varsa hata gönder
            return;
        }

        rooms[roomId] = { users: [], capacity: capacity || 2, password: password }; // Yeni odayı oluştur, şifreyi kaydet EKLENDİ
        rooms[roomId].users.push(socket.id); // Odayı oluşturan kullanıcıyı odaya ekle
        socket.join(roomId); // Kullanıcıyı odaya dahil et
        socket.emit('roomCreated', roomId); // Odanın oluşturulduğunu istemciye bildir

        io.to(roomId).emit('userJoined', { username: username }); // Kullanıcı adını gönder
        console.log(`Oda oluşturuldu: ${roomId}, Oluşturan: ${username}, Kapasite: ${rooms[roomId].capacity}, Şifre: ${password || 'Yok'}`); // Şifreyi logla
    });

    // Odaya Katılma
    socket.on('joinRoom', (data) => {
        const {roomId, password} = data;
        // Kullanıcı adını istemciden almalısın. Şimdilik varsayılan bir değer kullanıyorum,
        // İstemciden kullanıcı adını nasıl göndereceğini belirlemen gerekiyor.
        const username = socketUsernameMap[socket.id] || "Bilinmeyen Kullanıcı"; // Kullanıcı adını haritadan al veya varsayılan değer

        if (!rooms[roomId]) {
            socket.emit('roomError', 'Oda bulunamadı.'); // Oda yoksa hata gönder
            return;
        }

        if(rooms[roomId].password && rooms[roomId].password !== password) {
            socket.emit('roomError', 'Şifre yanlış.'); // Şifre yanlışsa hata gönder
            return;
        }

        if (rooms[roomId].users.length >= rooms[roomId].capacity) {
            socket.emit('roomError', 'Oda dolu.'); // Oda doluysa hata gönder
            return;
        }



        rooms[roomId].users.push(socket.id); // Kullanıcıyı odaya ekle
        socket.join(roomId); // Kullanıcıyı odaya dahil et
        socket.emit('roomJoined', roomId); // Odaya katılımı istemciye bildir

        io.to(roomId).emit('userJoined', { username: username }); // Kullanıcı adını gönder EKLENDİ
        console.log(`Kullanıcı odaya katıldı: ${roomId}, Katılan: ${username}`); // Kullanıcı adını logla
    });

    // Odadan Ayrılma
    socket.on('leaveRoom', (data) => {
        const { roomId, username } = data; // Kullanıcı adını istemciden al EKLENDİ (istemciden gönderdiğin için artık alabilirsin)
        if (!roomId || !username) { // username kontrolü EKLENDİ
            return socket.emit('leaveRoom', { success: false, message: "Oda ID veya kullanıcı adı eksik." });
        }

        if (!rooms[roomId]) {
            return socket.emit('leaveRoom', { success: false, message: "Oda bulunamadı." });
        }

        if (!rooms[roomId].users.includes(socket.id)) {
            return socket.emit('leaveRoom', { success: false, message: "Kullanıcı bu odada değil." });
        }

        rooms[roomId].users = rooms[roomId].users.filter(userId => userId !== socket.id); // Kullanıcıyı odadan çıkar

        socket.leave(roomId); // Soketi odadan ayır

        io.to(roomId).emit('userLeft', { username: username }); // Kullanıcı adını gönder EKLENDİ (doğru formatta gönder)

        if (rooms[roomId].users.length === 0) {
            delete rooms[roomId]; // Oda boşaldıysa odayı sil
            console.log(`Oda silindi (boşaldığı için): ${roomId}`);
        }

        socket.emit('leaveRoom', { success: true, message: "Odadan başarıyla ayrıldınız." }); // Başarılı ayrılma mesajı gönder
        console.log(`Kullanıcı odadan ayrıldı: ${roomId}, Ayrılan: ${username}`); // Kullanıcı adını logla
    });

    // Oda Mesajı Alma ve Yayınlama
    socket.on('roomMessage', (data) => {
        const { roomId, message, username } = data; // Kullanıcı adı da alındı
        io.to(roomId).emit('roomMessage', { username: username, message }); // Mesajı odadaki herkese yayınla, kullanıcı adıyla birlikte
        console.log(`Oda mesajı: ${roomId}, Gönderen: ${socket.id.substring(0, 5)}, Mesaj: ${message}, Kullanıcı Adı: ${username}`);
    });

    // Kullanıcı Ayrılma (Disconnect)
    socket.on('disconnect', () => {
        const username = socketUsernameMap[socket.id] || "Bilinmeyen Kullanıcı"; // Kullanıcı adını haritadan al veya varsayılan değer
        console.log('Kullanıcı ayrıldı: ' + socket.id + ", Kullanıcı Adı: " + username); // Kullanıcının ayrıldığını logla ve kullanıcı adını ekle
        delete socketUsernameMap[socket.id]; // Kullanıcı ayrıldığında eşleştirmeyi sil

        for (const roomId in rooms) {
            if (rooms[roomId].users.includes(socket.id)) {
                rooms[roomId].users = rooms[roomId].users.filter(userId => userId !== socket.id);
                io.to(roomId).emit('userLeft', { username: username }); // Kullanıcı adını gönder EKLENDİ (doğru formatta gönder)

                if (rooms[roomId].users.length === 0) {
                    delete rooms[roomId];
                    console.log(`Oda silindi: ${roomId}`);
                }
                break;
            }
        }
    });

    // Kullanıcı Adını Ayarlama - Yeni event EKLENDİ
    socket.on('setUsername', (username) => {
        socketUsernameMap[socket.id] = username; // Socket ID - Kullanıcı Adı eşleştirmesini sakla
        console.log(`Kullanıcı adı ayarlandı: ${username}, Socket ID: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000; // Port numarasını tanımla

server.listen(PORT, () => {
    console.log(`Server çalışıyor: http://localhost:${PORT}`); // Server başlatıldığında mesaj logla
});