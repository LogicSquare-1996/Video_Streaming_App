const socket = io('/');
const videoGrid = document.getElementById('localVideo');
const startButton = document.getElementById('startStream');
const stopButton = document.getElementById('stopStream');
const copyButton = document.getElementById('copyLink');
const videoToggle = document.getElementById('toggleVideo');
const audioToggle = document.getElementById('toggleAudio');
const viewerCount = document.getElementById('viewerCount');
const roomId = document.getElementById('roomId').textContent;

let localStream;
let peerConnections = {};

socket.on('viewer-count', count => {
    viewerCount.textContent = count;
});

socket.on('viewer-joined', async (viewerId) => {
    console.log('Viewer joined:', viewerId);
    try {
        const peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        peerConnections[viewerId] = peerConnection;

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    to: viewerId
                });
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { offer, to: viewerId });
    } catch (err) {
        console.error('Error creating peer connection:', err);
    }
});

socket.on('answer', async ({ answer, from }) => {
    try {
        const peerConnection = peerConnections[from];
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    } catch (err) {
        console.error('Error setting remote description:', err);
    }
});

socket.on('ice-candidate', async ({ candidate, from }) => {
    try {
        const peerConnection = peerConnections[from];
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (err) {
        console.error('Error adding ice candidate:', err);
    }
});

startButton.addEventListener('click', async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        videoGrid.srcObject = localStream;
        startButton.style.display = 'none';
        stopButton.style.display = 'block';
        videoToggle.disabled = false;
        audioToggle.disabled = false;
        socket.emit('start-broadcasting', roomId);
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Failed to access camera and microphone. Please ensure they are connected and permissions are granted.');
    }
});

stopButton.addEventListener('click', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        videoGrid.srcObject = null;
        startButton.style.display = 'block';
        stopButton.style.display = 'none';
        videoToggle.disabled = true;
        audioToggle.disabled = true;
        socket.emit('stop-broadcasting', roomId);
        
        // Close all peer connections
        Object.values(peerConnections).forEach(pc => pc.close());
        peerConnections = {};
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

copyButton.addEventListener('click', () => {
    const joinLink = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(joinLink);
    alert('Join link copied to clipboard!');
});

socket.emit('join-room', roomId, 'broadcaster');

window.onbeforeunload = () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        socket.emit('stop-broadcasting', roomId);
    }
};