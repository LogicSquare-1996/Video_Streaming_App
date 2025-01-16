function joinRoom() {
    const roomId = document.getElementById('roomInput').value.trim();
    if (roomId) {
        window.location.href = `/join/${roomId}`;
    }
}