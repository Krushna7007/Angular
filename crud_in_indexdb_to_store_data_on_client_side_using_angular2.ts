import { Component, OnInit, ViewChild, Renderer2, ElementRef } from '@angular/core';
import { AccltaskService } from '../accltask.service';
import { Accltask } from '../accltask';
import { Feedbackrating } from '../model/feedbackrating';
import { SessionUpdateService } from '../session.update.service';
import { Router } from "@angular/router";
import { stringify } from 'querystring';
import { timestamp, catchError } from 'rxjs/operators';
import { AppSettings } from '../appsettings';
import { HttpClient } from '@angular/common/http';

@Component({
	selector: 'app-ratings',
	templateUrl: './ratings.component.html',
	styleUrls: ['./ratings.component.css']
})
export class RatingsComponent implements OnInit {

	constructor(private http: HttpClient, private accltaskService: AccltaskService, private sessionservice: SessionUpdateService, private router: Router, private renderer: Renderer2) { }
	@ViewChild("messagearea", { static: false }) minput: ElementRef;

	ngOnInit() {



		if (!this.sessionservice.checkUserSession()) {
			this.router.navigate(['/login']);
			return;
		}

		this.username = this.sessionservice.getUserName();

		// if(this.sessionservice.isAdminSession())
		// {
		// this.router.navigate(['/ratingsdash']);
		//   return;
		// }
		this.initilizeSurveyData();
	}
	initilizeSurveyData() {
		var tempQuestion = this.sessionservice.getLocalStoreVar("question");
		var tempsurveytype = this.sessionservice.getLocalStoreVar("surveytype");
		var tempstrcategories = this.sessionservice.getLocalStoreVar("strcategories");


		if (tempQuestion != null && tempsurveytype != null && tempstrcategories != null) {
			this.question = tempQuestion;
			this.surveytype = tempsurveytype;
			this.categories = tempstrcategories.split(",");

		}
	}
	public question = "Please rate your recent experience";
	categories = ["Price", "Quality", "Ambience", "Luxury", "Speed", "Products", "CustomerService"];
	surveytype = "NUMRATE";
	public userrating = -1;
	ratingcategory = "nothing";
	public ratinginprogress = false;
	public thankyou = false;
	public ratingtimer = 0;
	public lattitude = -1;
	public longitude = -1;
	public message = "";
	public username = 'asd';
	public ratingtypeemoji = false;
	public ratingtypenumbers = true;




	showCategories(userrating): void {
		//show box msg


		this.userrating = userrating;

		this.ratinginprogress = true;

		// this.minput.nativeElement.focus();

		if (navigator.onLine)    // check whether is online or offline
		{
			this.getposition();
		}

		//Wait 10 sec
		this.ratingtimer = setTimeout(function () {
			this.ratinginprogress = false;
			this.thankyou = false;
			this.userrating = -1;

			console.log(this.ratinginprogress);
		}.bind(this), 60000);
	}


	postratingstoDB(): void {

		var feedbackrating = new Feedbackrating();
		feedbackrating.question = this.question;
		feedbackrating.feedbackcategory = this.ratingcategory;
		feedbackrating.rating = this.userrating;
		feedbackrating.active = 1;
		feedbackrating.guid = "guid";
		feedbackrating.message = this.message;


		feedbackrating.metadata = this.lattitude + ":" + this.longitude;
		// Dev name: Krushna (11-12-2019)
		// check whether is offline or online if online fire postRating api else store data in indexdb    
		if (navigator.onLine) {
			// Yes Online send data to Servies to send data to postRatingAPI
			this.accltaskService.postRating(feedbackrating)
				.subscribe(
					data => {
						console.log("Add GOT The data");
						var responsedata: any = data;
						if (!this.sessionservice.checkResponseSession(responsedata)) {
							this.router.navigate(['/login']);
							return;
						}
						error => console.log(error);
					});

			var db, data;
			var req = window.indexedDB;
			var request = req.open("survey_localStorage", 1);  //req.open("database_name",version) // create db if with given name if db doesn't exists

			request.onupgradeneeded = function (event) { //call on first time when table is not created
				db = (<FileReader>event.target).result; // InterFace FileReader use for Event Target(getting error use <FileReader>) 
				db.createObjectStore("rating", { keyPath: "id", autoIncrement: true });
			};
			request.onsuccess = function (event) {
				let reader = new FileReader();
				db = (<FileReader>event.target).result;
				var get_data = db.transaction(["rating"]).objectStore("rating").getAll();
				get_data.onsuccess = function (event) {
					outer_array();
				}
				get_data.onerror = function (event) {
					console.log(" fetching data error:")
				}
				//used to fetch result outside function for furhter use
				let outer_array = () => {
					data = get_data.result;
					if (data) {
						send_data_when_online(data);
					}
				}

			}
			// if data is exits in rating table then data will be uploaded iteratively via "postrating api"
			let send_data_when_online = (data) => {
				var local_db_id = [];
				for (var i = 0; i < data.length; i++) {

					var feedbackrating = new Feedbackrating();  //used Feedbackrating() object to carry rating data
					feedbackrating.question = data[i].question;
					feedbackrating.feedbackcategory = data[i].feedbackcategory;
					feedbackrating.rating = data[i].rating;
					feedbackrating.active = 1;
					feedbackrating.guid = "guid";
					feedbackrating.message = data[i].message;
					feedbackrating.metadata = data[i].metadata;

					local_db_id.push(data[i].id);//storing upload in feedback ids 
					//send Feedbackrating() object to "postrating api"
					this.accltaskService.postRating(feedbackrating)
						.subscribe(
							data => {
								var responsedata: any = data;
								if (!this.sessionservice.checkResponseSession(responsedata)) {
									this.router.navigate(['/login']);
									return;
								}
								error => console.log(error);
							});

				}
				// after uploading data, removed records from index db using id's from local_db_id variable
				for (let i = 0; i < local_db_id.length; i++) {

					var request = db.transaction(["rating"], "readwrite")
						.objectStore("rating")
						.delete(local_db_id[i]);
					request.onsuccess = function (event) {
						return alert("Entry has been removed from database");
					}
				}


			}
			this.message = '';
		}
		else{
			// if offline, will collect feedback and pass to OfflineDataStore()
			var localstorag_insert_data_dict =
			{
				question: feedbackrating.question,
				feedbackcategory: feedbackrating.feedbackcategory,
				rating: feedbackrating.rating,
				active: feedbackrating.active,
				guid: feedbackrating.guid,
				message: feedbackrating.message,
				metadata: feedbackrating.metadata
			};
			
			this.OfflineDataStore(localstorag_insert_data_dict);

		}

	}

	// if browser is supported with IndexedDB then storing feedbacks in indexed db
	// onerror() : Get called if any error is occurs while execution.
	// onsuccess() : Get called if rating table is already exists in index db then store data in rating table.
	// onupgradeneeded() : Get called if rating table is not exits then it will create table and store data in the new table.
	OfflineDataStore(localstorag_insert_data_dict) {
		var reader = new FileReader();
		var db, objectStore;
		var req = window.indexedDB;
		
		//check browser support
		if (!req){
			window.alert("Your browser doesn't support a stable version of IndexedDB.")
		}else
		{
			var request = req.open("survey_localStorage", 1);
			request.onerror = function (event) {
				console.log("error: ");
			};
		
			request.onsuccess = function (event) {  
				db = (<FileReader>event.target).result;
				var tran;
				tran = db.transaction(["rating"], "readwrite").objectStore("rating").add(localstorag_insert_data_dict);
				tran.onsuccess = function () {
					console.log("successfully added in localstorage");
				}
			};
		
			request.onupgradeneeded = function (event) { 
				db = (<FileReader>event.target).result;
				objectStore = db.createObjectStore("rating", { keyPath: "id", autoIncrement: true });
			};
		}

		

	}
	///-------------------------------------------------end db update and store-------------------------------------------------------- 

	saveRatings(ratingcategory): void {
		console.log("rating cateogriy" + ratingcategory);
		this.ratingcategory = ratingcategory;
		//show box msg
		this.ratinginprogress = false;
		this.thankyou = true;


		if (this.ratingtimer) {  //Cancel longer time that was started
			clearTimeout(this.ratingtimer);
			this.ratingtimer = 0;
		}
		this.postratingstoDB();

		this.initilizeSurveyData();
		//Wait 3 sec to show thank u page.
		setTimeout(function () {
			this.ratinginprogress = false;
			this.thankyou = false;
			this.userrating = -1;
			window.scrollTo(0, 0);
			console.log(this.thankyou);
		}.bind(this), 3000);

	}


	getposition() {
		console.log("Get location called");



		navigator.geolocation.getCurrentPosition(
			(position) => {

				this.lattitude = position.coords.latitude;
				this.longitude = position.coords.longitude

				console.log("Got success on getlocation lattitude " + this.lattitude);
				console.log("Got success on getlocation longitude" + this.longitude);
			}
			, (error) => {
				alert('code: ' + error.code + '\n' +
					'message: ' + error.message + '\n');
			});
	}

	func2() {
		console.log("Double click fired");
		this.router.navigate(['/appsettings']);
		return;
	}


}
