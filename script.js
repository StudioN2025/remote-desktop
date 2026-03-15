let peerConnection;
let dataChannel;
let role = null;
let hostId = null;
let localStream = null;

// Конфигурация STUN серверов
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Простая реализация сигналинга через localStorage (для демо)
// В реальном проекте лучше использовать WebSocket или Firebase
const signaling = {
    sendMessage: (message) => {
        const channel = new BroadcastChannel('remote-desktop');
        channel.postMessage(message);
    },
    
    onMessage: (callback) => {
        const channel = new BroadcastChannel('remote-desktop');
        channel.onmessage = (event) => callback(event.data);
    }
};

function setRole(newRole) {
    role = newRole;
    document.querySelector('.role-selection').style.display = 'none';
    
    if (role === 'host') {
        document.getElementById('host-controls').style.display = 'block';
        hostId = Math.random().toString(36).substring(2, 10);
        document.getElementById('host-id').textContent = hostId;
    } else {
        document.getElementById('client-controls').style.display = 'block';
    }
}

async function startHost() {
    try {
        // Запрашиваем доступ к экрану
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        
        createPeerConnection();
        
        // Добавляем треки в peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Создаем data channel для управления
        dataChannel = peerConnection.createDataChannel('control');
        setupDataChannel();
        
        // Создаем оффер
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        updateStatus('Ожидание подключения...', 'connecting');
        
        // Слушаем ответ от клиента
        signaling.onMessage(async (message) => {
            if (message.type === 'answer' && message.targetId === hostId) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
                updateStatus('Клиент подключен!', 'connected');
                document.getElementById('controls-panel').style.display = 'block';
            }
        });
        
    } catch (err) {
        console.error('Error starting host:', err);
        updateStatus('Ошибка: ' + err.message, 'disconnected');
    }
}

async function connectToHost() {
    const targetHostId = document.getElementById('host-id-input').value;
    if (!targetHostId) return;
    
    createPeerConnection();
    
    // Слушаем data channel от хоста
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel();
    };
    
    // Ждем оффер от хоста
    signaling.onMessage(async (message) => {
        if (message.type === 'offer' && message.targetId === targetHostId) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            signaling.sendMessage({
                type: 'answer',
                targetId: targetHostId,
                data: answer
            });
            
            updateStatus('Подключено к хосту!', 'connected');
            document.getElementById('controls-panel').style.display = 'block';
        }
    });
    
    // Запрашиваем подключение
    signaling.sendMessage({
        type: 'request-offer',
        targetId: targetHostId
    });
    
    updateStatus('Подключение...', 'connecting');
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            signaling.sendMessage({
                type: 'ice-candidate',
                candidate: event.candidate,
                targetId: role === 'host' ? hostId : document.getElementById('host-id-input').value
            });
        }
    };
    
    peerConnection.ontrack = (event) => {
        const remoteVideo = document.getElementById('remote-video');
        remoteVideo.srcObject = event.streams[0];
        document.getElementById('remote-screen').style.display = 'block';
    };
}

function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log('Data channel opened');
    };
    
    dataChannel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleControlMessage(data);
    };
}

function sendMouseAction(action) {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
            type: 'mouse',
            action: action
        }));
    }
}

function sendKeyPress(event) {
    if (event.key === 'Enter' && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
            type: 'keyboard',
            text: event.target.value
        }));
        event.target.value = '';
    }
}

function handleControlMessage(data) {
    // Здесь хост обрабатывает команды управления
    console.log('Control message:', data);
    
    switch(data.type) {
        case 'mouse':
            // Имитация действий мыши (в браузере ограничено)
            console.log('Mouse action:', data.action);
            break;
        case 'keyboard':
            // Имитация ввода с клавиатуры
            console.log('Keyboard input:', data.text);
            break;
    }
}

function updateStatus(message, type) {
    const statusDiv = document.getElementById('connection-status');
    statusDiv.textContent = message;
    statusDiv.className = `status-${type}`;
}

function copyId() {
    navigator.clipboard.writeText(hostId);
    alert('ID скопирован!');
}
