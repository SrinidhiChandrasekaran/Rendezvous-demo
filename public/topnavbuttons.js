var cameraimage = document.getElementById("camera")
var screenshareimage = document.getElementById("screenshare")

//Mic image function
var micimage = document.getElementById("mic")
//var micarray = ['.\img2_MicOff.jpg', '.\img2_MicOn.jpg']
var micarray = [
    "file:///D:/Srinidhi/Microsoft%20Engage21%20Mentorship/Demo/public/img2_MicOff.jpg",
    "file:///D:/Srinidhi/Microsoft%20Engage21%20Mentorship/Demo/public/img2_MicOn.png"
]
var miccounter = 0
function mic() {
    miccounter = (miccounter + 1) % (micarray.length);
    micimage.src = micarray[miccounter];
}