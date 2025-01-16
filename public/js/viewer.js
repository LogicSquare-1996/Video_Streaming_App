const socket = io('/');
const video = document.getElementById('remoteVideo');
const joinButton = document.getElementById('joinStream');
const leaveButton = document.getElementById('leaveStream');
const videoToggle = document.getElementById('toggleVideo');
const audioToggle = document.getElementById('toggleAudio');
const joinUrlElement = document.getElementById('joinUrl');
const roomId = window.location.pathname.split('/').pop();

let peerConnection;
let localStream;

// Set join URL
const joinUrl = `${window.location.origin}/join/${roomId}`;
joinUrlElement.textContent = joinUrl;

joinButton.addEventListener('click', async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        setupPeerConnection();
        socket.emit('viewer-join', roomId);
        joinButton.style.display = 'none';
        leaveButton.style.display = 'flex';
        videoToggle.disabled = false;
        audioToggle.disabled = false;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Failed to access camera and microphone. Please ensure they are connected and permissions are granted.');
    }
});

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.ontrack = event => {
        console.log('Received remote track');
        if (video.srcObject !== event.streams[0]) {
            video.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                to: 'broadcaster'
            });
        }
    };

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

leaveButton.addEventListener('click', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    
    joinButton.style.display = 'flex';
    leaveButton.style.display = 'none';
    videoToggle.disabled = true;
    audioToggle.disabled = true;
    socket.emit('viewer-leave', roomId);
});

socket.on('offer', async ({ offer, from }) => {
    try {
        if (!peerConnection) {
            setupPeerConnection();
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { answer, to: from });
    } catch (err) {
        console.error('Error handling offer:', err);
    }
});

socket.on('ice-candidate', async ({ candidate, from }) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (err) {
        console.error('Error adding ice candidate:', err);
    }
});

videoToggle.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        videoToggle.textContent = videoTrack.enabled ? '🎥' : '🚫';
    }
});

audioToggle.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        audioToggle.textContent = audioTrack.enabled ? '🎤' : '🔇';
    }
});

socket.on('broadcaster-disconnected', () => {
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    joinButton.style.display = 'flex';
    leaveButton.style.display = 'none';
    videoToggle.disabled = true;
    audioToggle.disabled = true;
});

socket.emit('join-room', roomId, 'viewer');