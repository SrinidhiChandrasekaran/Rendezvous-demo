$(document).ready(function(){
	$.ajax({ url: "AdminData",
        context: document.body,
        success: function(data){
		    tableBody = $("table tbody");
		    for(i = 0; i < data.length;i++){
				var duration = parseInt(data[i].duration);
				duration /= (3600*1000); //duration is in milli seconds so convert it to hours
				var created_at = data[i].created_at.replace("GMT+0530 ", "");
				created_at = created_at.replace("(India Standard Time)","IST");
				var ended_at = data[i].ended_at.replace("GMT+0530 ", "");
				ended_at = ended_at.replace("(India Standard Time)","IST");
				var markup = '<tr>' + '<td>' + data[i].id + '</td>' + '<td>' + data[i].initiator + '</td>' + '<td>' + data[i].participant + '</td>' + '<td>' + created_at + '</td>';
				markup += '<td>' + ended_at + '</td>' + '<td>' + duration.toFixed(2) + '</td>' + '</tr>'
				tableBody.append(markup)
		   	}
        }
	});
});