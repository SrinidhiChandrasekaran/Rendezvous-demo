//DOM elements
const roomSelectionContainer = document.getElementById('room-selection-container')
const roomInput = document.getElementById('room-input')
const callButton = document.getElementById('call-button')
const chatButton = document.getElementById('chat-button')

const videoChatContainer = document.getElementById('video-chat-container')
const localVideoComponent = document.getElementById('local-video')
const remoteVideoComponent = document.getElementById('remote-video')

const topnavContainer = document.getElementById('topnav')
const timer = document.getElementById('meeting-timer')
const leaveButton = document.getElementById('leave-meeting')
const micButtonImage = document.getElementById('mic')
const cameraButtonImage = document.getElementById('camera')

const chatButtonImage = document.getElementById('chat')
const chatContainer = document.getElementById('chat-container')
const messageInputField = document.getElementById('send-message-field')
const messageInputBox = document.getElementById('send-message')
const sendButton = document.getElementById('chat-send-button')
const receiveBox = document.getElementById('receive-message')
const callFromChatButton = document.getElementById('call-from-chat-button')
const homeFromChatButton = document.getElementById('home-from-chat-button')

const fileshareButtonImage = document.getElementById('fileshare')
const fileContainer = document.getElementById('file-container')
const fileInputBox = document.getElementById('send-file')
const filesendButton = document.getElementById('file-send-button')
const receiveFileBox = document.getElementById('receive-file')

const diallingModal = document.getElementById('dialling-modal')

//Variables
var socket = io();
var username, user_list, accept, roomId;
var mediaConstraints = {
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
    },
    video: {
        width: 1280,
        height: 720
    },
}
let localStream, remoteStream
let isRoomCreator, dataChannelCreated, callCreated
let rtcPeerConnection
let sendDataChannel, receiveDataChannel
var whichButton, destination
var chat_flag = false, file_flag = false;

// Free public STUN servers provided by Google.
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
}

//Functions
function populateList() {
    //Add the given username to dropdown
    socket.emit('get_user_list');
}

function adduser() {
    username = document.getElementById('username').value
    console.log('Username: ' + username)
    socket.emit('user_connected', username);
    socket.emit('get_user_list');
}

function inviteCall() {
    user_list = document.getElementById('user-list')
    console.log('User_list.value: ' + user_list.value);
    //diallingModal.style = 'display: block;'
    if(user_list.value!=="none") {
        $('#dialling-modal').modal('show')
        socket.emit('user_inviting_call', username, user_list.value);
    }
    else {
        alert("Please select a user at the dropdown");
    }
}

function inviteChat() {
    whichButton = 2
    user_list = document.getElementById('user-list')
    console.log('User_list.value' + user_list.value);
    if(user_list.value!=="none") {
        socket.emit('user_inviting_chat', username, user_list.value);
    }
    else {
        alert("Please select a user at the dropdown");
    }
}

function joinRoom() {
    socket.emit('join', username)
    showVideoConference()
}

function showVideoConference() {
    roomSelectionContainer.style = 'display: none'
    videoChatContainer.style = 'display: block'
    topnavContainer.style = 'display: block';
    chatContainer.style = 'display: none';
    callFromChatButton.style = 'display: none';
    homeFromChatButton.style = 'display: none';
    var start = new Date();
    var t = setInterval(function() {
        var now = new Date();
        var distance = now - start;
        var hours = Math.floor((distance / (1000*60*60*24)) / (1000*60*60))
        var minutes = Math.floor((distance % (1000*60*60)) / (1000*60))
        var seconds = Math.floor((distance % (1000*60)) / 1000)
        if(hours>0) {
            timer.innerHTML = hours + " : " + minutes + " : " + seconds
        }
        else {
            timer.innerHTML = minutes + " : " + seconds
        }
    }, 1000);
}

async function setLocalStream(mediaConstraints) {
    let stream
    try {
        stream = await navigator.mediaDevices.getUserMedia(mediaConstraints)
    }
    catch (error) {
        console.error('Could not get user media', error)
    } 
    localStream = stream
    localVideoComponent.srcObject = stream
}

var videoSender, camVideoTrack;
function addLocalTracks(rtcPeerConnection) {
    //For screenshare
    camVideoTrack = localStream.getVideoTracks()[0];
    var camAudioTrack = localStream.getAudioTracks()[0];
    videoSender = rtcPeerConnection.addTrack(camVideoTrack, localStream);
    var audioSender = rtcPeerConnection.addTrack(camAudioTrack, localStream);
    console.log('Adding tracks to rtcPeerConnection')
    console.log(rtcPeerConnection.ontrack)
}

function setRemoteStream(event) {
    console.log('Firing ontrack event')
    remoteVideoComponent.srcObject = event.streams[0]
    remoteStream = event.stream
}

function handleSendChannelStatusChange(event) {
    if (sendDataChannel) {
        var state = sendDataChannel.readyState;
        if (state === "open") {
            messageInputBox.disabled = false;
            messageInputBox.focus();
            sendButton.disabled = false;
        }
    }
}

function receiveChannelCallback(event) {
    receiveDataChannel = event.channel;
    //console.log(receiveDataChannel);
    receiveDataChannel.onmessage = handleReceiveMessage;
    receiveDataChannel.onopen = handleReceiveChannelStatusChange;
    receiveDataChannel.onclose = handleReceiveChannelStatusChange;
}

function sendIceCandidate(event) {
    if (event.candidate) {
        socket.emit('webrtc_ice_candidate', {
            roomId,
            label: event.candidate.sdpMLineIndex,
            candidate: event.candidate.candidate,
        })
    }
}

async function createOffer(rtcPeerConnection) {
    let sessionDescription
    try {
        sessionDescription = await rtcPeerConnection.createOffer()
        rtcPeerConnection.setLocalDescription(sessionDescription)
    }
    catch (error) {
        console.error(error)
    }
    socket.emit('webrtc_offer', {
        type: 'webrtc_offer',
        sdp: sessionDescription,
        roomId,
    })
}

var count;
var fileSize, fileName;
var receiveBuffer = [];
function handleReceiveMessage(event) {
    if(typeof event.data === 'string' && event.data.startsWith("mesg")) {
        //message receive code
        var message = event.data;
        message = message.replace("mesg", "");
        var el = document.createElement("p");
        var txtNode = document.createTextNode(message);
        el.appendChild(txtNode);
        receiveBox.appendChild(el);
        //display message box when message appers
        chatContainer.style = 'display: block; height: 90%; position: absolute; top: 10%;';
        sendButton.style = 'display: block';
        messageInputBox.style = 'display: block';
        messageInputField.style = 'display: block';
        remoteVideoComponent.style = 'width: 80%';
        localVideoComponent.style = 'right: 20%';
        chat_flag = !chat_flag;
    }
    else {
        //file receive code
        if (typeof event.data === 'string') {
            const fileMetaInfo = event.data.split(',');
            fileSize = parseInt(fileMetaInfo[0]);
            fileName = fileMetaInfo[1];
            count = 0;
            console.log('File name: ' + fileName + ' and file size: ' + fileSize + ' are received');
            console.log(fileSize, count);
            return;
        }
        receiveBuffer.push(event.data);
        count += event.data.byteLength;
        console.log(fileSize, count);
        if (fileSize === count) {
            console.log('File received');
            const received = new Blob(receiveBuffer);
            receiveBuffer = [];
            var downloadAnchor = document.createElement('a');
            var link = document.createTextNode(fileName + ' ' + fileSize + ' bytes');
            downloadAnchor.appendChild(link);
            downloadAnchor.href = URL.createObjectURL(received);
            console.log(downloadAnchor.href);
            downloadAnchor.download = fileName;
            receiveFileBox.appendChild(downloadAnchor);
        }
        //display filebox when file appears
        fileContainer.style = 'display: block; height: 90%; position: absolute; top: 10%;';
        remoteVideoComponent.style = 'width: 80%';
        localVideoComponent.style = 'right: 20%';
        file_flag = !file_flag;
    }
}

function handleReceiveChannelStatusChange(event) {
    if (receiveDataChannel) {
        console.log("Receive channel's status has changed to " + receiveDataChannel.readyState);
    }
}

async function createAnswer(rtcPeerConnection) {
    let sessionDescription
    try {
        sessionDescription = await rtcPeerConnection.createAnswer()
        rtcPeerConnection.setLocalDescription(sessionDescription)
    }
    catch (error) {
        console.error(error)
    }
    socket.emit('webrtc_answer', {
        type: 'webrtc_answer',
        sdp: sessionDescription,
        roomId,
    })
}

function leaveRoom() {
    socket.emit('leave', roomId);
    hideVideoConference();
    stopRemoteStream();
    stopLocalStream();
    rtcPeerConnection.close();
}

function hideVideoConference() {
    roomSelectionContainer.style = 'display: block'
    videoChatContainer.style = 'display: none'
    topnavContainer.style = 'display: none'
    chatContainer.style = 'display: block';
    sendButton.style = 'display: none';
    messageInputBox.style = 'display: none';
    messageInputField.style = 'display: none';
    fileContainer.style = 'display: none';
}

function stopRemoteStream() {
    remoteVideoComponent.srcObject = null;
}

function stopLocalStream() {
    localStream.getTracks().forEach((track) => {
        track.stop();
    });
    localVideoComponent.srcObject = null;
}

function mic() {
    localStream.getAudioTracks()[0].enabled = !(localStream.getAudioTracks()[0].enabled);
    console.log('Mic enabled: ' + localStream.getAudioTracks()[0].enabled);
    if(localStream.getAudioTracks()[0].enabled) {
        micButtonImage.src = '/img2_MicOn.png';
    }
    else {
        micButtonImage.src = '/img2_MicOff.jpg';
    }
}

function camera() {
    localStream.getVideoTracks()[0].enabled = !(localStream.getVideoTracks()[0].enabled);
    console.log("Camera enable: " + localStream.getVideoTracks()[0].enabled);
    if(localStream.getVideoTracks()[0].enabled) {
        cameraButtonImage.src = '/img3_CameraOn.jpg';
    }
    else {
        cameraButtonImage.src='/img3_CameraOff.jpg';
    }
}

function chatting() {
    chat_flag = !chat_flag;
    if(chat_flag) { //display chat box
        chatContainer.style = 'display: block; height: 90%; position: absolute; top: 10%;';
        sendButton.style = 'display: block';
        messageInputBox.style = 'display: block';
        messageInputField.style = 'display: block';
        remoteVideoComponent.style = 'width: 80%';
        localVideoComponent.style = 'right: 20%';
    }
    else { //hide chat box
        chatContainer.style = 'display: none';
        remoteVideoComponent.style = 'width: 100%';
        localVideoComponent.style = 'right: 5.6px';
    }
}

function fileshare() {
    file_flag = !file_flag;
    if(file_flag) { //display fileshare box
        fileContainer.style = 'display: block; height: 90%; position: absolute; top: 10%;';
        remoteVideoComponent.style = 'width: 80%';
        localVideoComponent.style = 'right: 20%';
    }
    else { //hide fileshare box
        fileContainer.style = 'display: none';
        remoteVideoComponent.style = 'width: 100%';
        localVideoComponent.style = 'right: 5.6px';
    }
}

var screenshare_flag = false;
async function screenshare() {
    let displayMediaStream;
    screenshare_flag = !screenshare_flag;
    //start screenshare
        if (!displayMediaStream) {
            displayMediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {width: 1280, height: 720, cursor: "always"},
                audio: {echoCancellation: true, noiseSuppression: true, sampleRate: 44100},
            });
        }
        var screenVideoTrack = displayMediaStream.getVideoTracks()[0];
        videoSender.replaceTrack(screenVideoTrack);
    //stop screenshare
        displayMediaStream.getVideoTracks()[0].addEventListener('ended', () => {
            videoSender.replaceTrack(camVideoTrack);
        })
}

function sendMessage() {
    if(whichButton == 1) { //call button chat
        var message = messageInputBox.value;
        var el = document.createElement("p");
        var txtNode = document.createTextNode('You: ' + message);
        el.appendChild(txtNode);
        el.style = 'color: green';
        receiveBox.appendChild(el);
        //message = "mesg" + message;
        message = "mesg" + username + ": " + message;
        sendDataChannel.send(message);
        messageInputBox.value = "";
        messageInputBox.focus();
        message = message.replace("mesg", "");
    }
    else { //chat button chat
        var message = messageInputBox.value;
        var el = document.createElement("p");
        var txtNode = document.createTextNode('You: ' + message);
        el.appendChild(txtNode);
        el.style = 'color: green';
        receiveBox.appendChild(el);
        socket.emit('chat_from_client', username + ': ' + message, destination);
    }
}

function sendFile() {
    const file = fileInputBox.files[0];
    console.log(`File is ${[file.name, file.size, file.type, file.lastModified].join(' ')}`);
    if (file.size === 0) {
        alert('File is empty, please select a non-empty file.');
        return;
    }
    sendDataChannel.send(file.size + ',' + file.name);
    console.log('File name: ' + file.name + ' and file size: ' + file.size + ' is sent');
    const chunkSize = 16384;
    fileReader = new FileReader();
    let offset = 0;
    fileReader.addEventListener('error', error => console.error('Error reading file:', error));
    fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
    fileReader.addEventListener('load', e => {
        console.log('FileRead.onload ', e);
        console.log(e.target.result);
        sendDataChannel.send(e.target.result);
        offset += e.target.result.byteLength;
        if (offset < file.size) {
            readSlice(offset);
        } else {
            alert(`${file.name} has been sent successfully.`);
            filesendButton.disabled = false;
        }
    });
    const readSlice = o => {
        console.log('readSlice ', o);
        const slice = file.slice(offset, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };
    readSlice(0);
}

function showChatPanel() {
    roomSelectionContainer.style = 'display: none'
    chatContainer.style = 'display: block; height: 100%; width: 100%; border: 5px solid red; margin-right: 5px;'
    sendButton.style = 'display: block'
    messageInputBox.style = 'display: block'
    messageInputField.style = 'display: block'
    topnavContainer.style = 'display: none'
    callFromChatButton.style = 'display: block'
    homeFromChatButton.style = 'display: block'
}

function homeFromChat() {
    roomSelectionContainer.style = 'display: block'
    chatContainer.style = 'display: block'
    sendButton.style = 'display: none'
    messageInputBox.style = 'display: none'
    messageInputField.style = 'display: none'
    topnavContainer.style = 'display: none'
    callFromChatButton.style = 'display: none'
    homeFromChatButton.style = 'display: none'
}

function callFromChat() {
    whichButton = 1;
    //inviteCall();
    console.log('Destination: ' + destination);
    socket.emit('user_inviting_call', username, destination);
}

//Socket Handlers
socket.on('myHandler', () => {
    console.log('Socket event callback: Called from server');
})

socket.on('send_username', function(str) {
    username = str
})

socket.on('call_invite_incoming', (caller) => {
    console.log('Call invite incoming from: ' + caller)
    accept = confirm(caller + ' is inviting you for a call');
    if(accept) { //You accepted the invite
        socket.emit('call_accepted', username, caller)
        whichButton = 1
        joinRoom(whichButton)
    }
    else { //You have not accepted
        socket.emit('call_not_accepted', username, caller)
    }
})

socket.on('call_accepted', function(callee) {
    //diallingModal.style = 'display: none;'
    $('#dialling-modal').modal('hide')
    console.log('Socket event callback: call_accepted ' + callee)
    alert(callee + ' has accepted your call!')
    whichButton = 1
    joinRoom(whichButton)
})

socket.on('call_not_accepted', function(callee) {
    diallingModal.style = 'display: none;'
    console.log('Socket event callback: call_not_accepted ' + callee)
    alert(callee + ' is not accepting your call!')
})

socket.on('chat_invite_incoming', (caller) => {
    console.log('Chat invite incoming from : ' + caller)
    accept = confirm(caller + ' is inviting you for a chat');
    //alert(caller + ' is inviting you for a chat');
    if(accept) {
        socket.emit('chat_accepted', username, caller)
        whichButton = 2
        destination = caller
        console.log('Destination: ' + destination)
        showChatPanel()
    }
    else {
        socket.emit('chat_not_accepted', username, caller)
    }
})

//var callee_global;
socket.on('chat_accepted', function(callee) {
    console.log('Socket event callback: chat_accepted' + callee)
    alert(callee + ' has accepted your chat!')
    whichButton = 2
    destination = user_list.value
    console.log('Destination: ' + destination)
    showChatPanel()
})

socket.on('chat_not_accepted', function(callee) {
    alert(user_list.value + ' is not accepting your chat!')
})

socket.on('chat_from_server', function(message) {
    var el = document.createElement("p");
    var txtNode = document.createTextNode(message);
    el.appendChild(txtNode);
    el.style = 'color: purple';
    receiveBox.appendChild(el);
})

socket.on('sending_user_list', (users) => {
    user_list = document.getElementById("user-list")
    for(var i=0; i<users.length; i++) {
        if(users[i]!==username) {
            var option = document.createElement("option");
            option.text = users[i];
            user_list.add(option);
        }
    }
})

socket.on('new_client_connect', (new_client_username) => {
    user_list = document.getElementById("user-list")
    var option = document.createElement("option")
    option.text = new_client_username
    user_list.add(option)
})

socket.on('user_disconnected', (disconnected_username) => {
    console.log('Socket callback: user_disconnected ' + disconnected_username)
    var user_list = document.getElementById("user-list")
    var index = 1
    Array.from(user_list.options).forEach((option) => {
        //console.log(option.text, option.value, option.selected)
        if(option.text===disconnected_username) {
            console.log(option.text + ' matching username found')
            //user_list.remove(index)
            user_list.removeChild(option)
        }
        else {
            index++
        }
    })
})

socket.on('room_created', async (x) => {
    console.log('Socket event callback: room_created')
    roomId = x
    await setLocalStream(mediaConstraints)
    isRoomCreator = true
})

socket.on('room_joined', async (x) => {
    console.log('Socket event callback: room_joined')
    roomId = x
    await setLocalStream(mediaConstraints)
    socket.emit('start_call', roomId)
})

socket.on('full_room', (x) => {
    console.log('Socket event call_back: full_room')
    roomId = x
    alert('The room is full, please try another one')
})

socket.on('start_call', async () => {
    console.log('Socket event callback: start_call')
    if (isRoomCreator) {
        rtcPeerConnection = new RTCPeerConnection(iceServers)
        addLocalTracks(rtcPeerConnection)
        rtcPeerConnection.ontrack = setRemoteStream
        sendDataChannel = rtcPeerConnection.createDataChannel("sendDataChannel");
        console.log("Created send data channel");
        sendDataChannel.onopen = handleSendChannelStatusChange;
        sendDataChannel.onclose = handleSendChannelStatusChange;
        rtcPeerConnection.ondatachannel = receiveChannelCallback;
        rtcPeerConnection.onicecandidate = sendIceCandidate
        await createOffer(rtcPeerConnection)
    }
})

socket.on('webrtc_ice_candidate', (event) => {
    console.log('Socket event callback: webrtc_ice_candidate')
    // ICE candidate configuration.
    var candidate = new RTCIceCandidate({
        sdpMLineIndex: event.label,
        candidate: event.candidate,
    })
    rtcPeerConnection.addIceCandidate(candidate)
})

socket.on('webrtc_offer', async (event) => {
    console.log('Socket event callback: webrtc_offer')
    if (!isRoomCreator) {
        rtcPeerConnection = new RTCPeerConnection(iceServers)
        addLocalTracks(rtcPeerConnection)
        rtcPeerConnection.ontrack = setRemoteStream
        sendDataChannel = rtcPeerConnection.createDataChannel("sendDataChannel");
        sendDataChannel.onopen = handleSendChannelStatusChange;
        sendDataChannel.onclose = handleSendChannelStatusChange;
        rtcPeerConnection.ondatachannel = receiveChannelCallback;
        rtcPeerConnection.onicecandidate = sendIceCandidate
        rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event))
        await createAnswer(rtcPeerConnection)
    }
})

socket.on('webrtc_answer', (event) => {
    console.log('Socket event callback: webrtc_answer')
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event))
})