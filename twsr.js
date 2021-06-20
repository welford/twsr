/*\
title: $:/plugins/welford/twsr/twsr.js
type: application/javascript
module-type: widget

twsr widget
\*/
(function(){
/*jslint node: true, browser: true */
/*global $tw: false */
//"use strict";

//other data we try to grab
var g_src		= "tiddler";	//the tiddler that backs this data, if this is missing use "currentTiddler"
var Widget = require("$:/core/modules/widgets/widget.js").widget;

var g_twsrActive    = false; 	//are we rendering the twsr SSR UI?
//used to communicate between TWSR widget and Answer/Question Widgets
var g_questionElm   = null;		//question gets rendered into this is the SSR UI is active
var g_answerElm     = null;		// used to store a local array of answers to communicate between widgets
var g_answerClickCB = null; 	// used to store a cb func to communicate between widgets

var TWSRWidget = function(parseTreeNode,options) {
	this.initialise(parseTreeNode, options);
};

//Inherit from the base widget class
TWSRWidget.prototype = new Widget();

//no idea about the other SM algorithms
TWSRWidget.prototype.AddNewCards = function (amount) {
	var tiddler = $tw.wiki.getTiddler(this.tiddler_name);

	var tags = tiddler.getFieldList("tags");	
	var tagFilter = "",filter = "";
	//tags we are interested in
	for(i = 0;i<tags.length;i++){
		var tag = tags[i];
		if(this.twsr_tags && this.twsr_tags.indexOf(tag) != -1) continue;
		tagFilter += "[tag["+tag+"]]";
	}
	//tags we want to ignore
	// 1. the twsr config tags
	if(this.twsr_tags){
		for(i = 0;i<this.twsr_tags.length;i++){
			tagFilter += "+[!tag["+this.twsr_tags[i]+"]]";
		}
	}
	// 2. explicit ignore tags
	if(this.twsr_ignore_tags){
		for(i = 0;i<this.twsr_ignore_tags.length;i++){
			tagFilter += "+[!tag["+this.twsr_ignore_tags[i]+"]]";
		}
	}
	//needs to have twsr interval attribute
	filter = tagFilter + "+[field:twsr_interval[]]";
	var tiddlers = $tw.wiki.filterTiddlers(filter);
	//WHAT SHOULD  WE SORT BY?
	//$tw.wiki.sortTiddlers(tiddlers, "twsr_interval");  //largest numbers first?

	var newAddList = [];
	for(i = 0;i<tiddlers.length && i<amount;i++){
		$tw.wiki.setText(tiddlers[i], "twsr_grade",    undefined, 0);
		$tw.wiki.setText(tiddlers[i], "twsr_rnumber",  undefined, 0);
		$tw.wiki.setText(tiddlers[i], "twsr_efactor",  undefined, 2.5);
		$tw.wiki.setText(tiddlers[i], "twsr_interval", undefined, 0);
		$tw.wiki.setText(tiddlers[i], "twsr_ivalue", undefined, 0);
		newAddList.push(tiddlers[i]);
	}
	//filter out tiddlers whose twsr_interval date is in the future
	return newAddList;
}

//no idea about the other SM algorithms
TWSRWidget.prototype.GetScheduledCards = function (title) {
	//get defaults for things that are not set
	var tiddler = $tw.wiki.getTiddler(title);
	//new first, then scheduled, then poorly graded!

	//1. NEW
	var tags = tiddler.getFieldList("tags");	
	var tagFilter = "",filter = "";	
	for(i = 0;i<tags.length;i++){
		var tag = tags[i];
		if(this.twsr_tags && this.twsr_tags.indexOf(tag) != -1) continue;
		tagFilter += "[tag["+tag+"]]";
	}

	var tiddlers = [];
	if(tiddlers.length == 0)
	{
		//2. SCHEDULED
		filter = tagFilter + ":filter[get[twsr_interval]compare:date:lt["+$tw.utils.stringifyDate(new Date())+"]]";//+[!tag[$:/tags/twsr]]";
		if(this.twsr_tags){
			for(i = 0;i<this.twsr_tags.length;i++){
				filter += "+[!tag["+this.twsr_tags[i]+"]]";
			}
		}
		// 2. explicit ignore tags
		if(this.twsr_ignore_tags){
			for(i = 0;i<this.twsr_ignore_tags.length;i++){
				filter += "+[!tag["+this.twsr_ignore_tags[i]+"]]";
			}
		}
		tiddlers = $tw.wiki.filterTiddlers(filter);

		if(tiddlers.length == 0) {
			//3. POORLY GRADED
			filter = tagFilter + ":filter[get[twsr_grade]compare:number:lt[4]]";
			tiddlers = $tw.wiki.filterTiddlers(filter);
		}else{
			$tw.wiki.sortTiddlers(tiddlers, "twsr_interval");
		}
	}
	//filter out tiddlers whose twsr_interval date is in the future
	return tiddlers;
}

//no idea about the other SM algorithms
TWSRWidget.prototype.UpdateCardSM2 = function (title, grade) {

	var tiddler = $tw.wiki.getTiddler(title);
	// https://en.wikipedia.org/wiki/SuperMemo
	var rNumber = 0, eFactor = 2.5, iValue = 0;
	if(tiddler.hasField("twsr_rnumber")){
		rNumber = parseInt(tiddler.getFieldString("twsr_rnumber"));
	}
	if(tiddler.hasField("twsr_efactor")){
		eFactor = parseFloat(tiddler.getFieldString("twsr_efactor"));
	}
	if(tiddler.hasField("twsr_ivalue")){
		iValue = parseFloat(tiddler.getFieldString("twsr_ivalue"));
	}
	if(grade >= 3){
		if(rNumber == 0){
			iValue = 1; //+1 days
		} 
		else if(rNumber == 1){
			iValue = 6; //+6 days
		}
		else {
			iValue = iValue * eFactor;
		}
		//EF ← EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02))
		eFactor = eFactor + (0.1-(5-grade)*(0.08+(5-grade)*0.02))
		if(eFactor < 1.3){
			eFactor = 1.3;
		}
		rNumber++;
	}
	else{
		iValue = 1; //+1 day
		rNumber = 0; 
		//what happens to e factor here
	}
	var date = new Date();
	var reviewDate = new Date(date.getTime() + (iValue * 24 * 60 * 60 * 1000));
	$tw.wiki.setText(title, "twsr_grade",    undefined, grade);
	$tw.wiki.setText(title, "twsr_rnumber",  undefined, rNumber);
	$tw.wiki.setText(title, "twsr_efactor",  undefined, eFactor);
	$tw.wiki.setText(title, "twsr_interval", undefined, $tw.utils.stringifyDate(reviewDate));
	$tw.wiki.setText(title, "twsr_ivalue", undefined, iValue);
}

function mouseX(evt) {
	if (evt.pageX) {
		return evt.pageX;
	} else if (evt.clientX) {
		return evt.clientX + (document.documentElement.scrollLeft ?
			document.documentElement.scrollLeft :
			document.body.scrollLeft);
	} else {
		return null;
	}
}

function mouseY(evt) {
	if (evt.pageY) {
		return evt.pageY;
	} else if (evt.clientY) {
		return evt.clientY + (document.documentElement.scrollTop ?
		document.documentElement.scrollTop :
		document.body.scrollTop);
	} else {
		return null;
	}
}

TWSRWidget.prototype.OpenTiddler = function (event,name) {	
	var bounds = this.domNodes[0].getBoundingClientRect();
	this.dispatchEvent({
		type: "tm-navigate",
		navigateTo: name,
		navigateFromTitle: this.getVariable("storyTiddler"),
		navigateFromNode: this,
		navigateFromClientRect: {
			top: bounds.top, left: bounds.left, width: bounds.width, right: bounds.right, bottom: bounds.bottom, height: bounds.height
		},
		navigateSuppressNavigation: event.metaKey || event.ctrlKey || (event.button === 1)
	});
};

TWSRWidget.prototype.CreateElement = function (type, content, style) {
	var elm = this.document.createElement(type);
	for(let prop of Object.keys(style)){
	var tmp = Object.keys(style)
		elm.style[prop.toString()] = style[prop.toString()];
	}
	elm.innerHTML = content;
	return elm;
}

TWSRWidget.prototype.ShowCards = function (parent,nextSibling) {
	var _this = this;
	
	var settingsDiv  = _this.CreateElement("span", "⚙", 				{cursor:"pointer"});
	var gradeDiv     = _this.CreateElement("div", "", 					{float:"left", display:"none"});
	var completeDiv  = _this.CreateElement("div", _this.twsr_cards_finished, 	
																		{float:"left", display:"none"});
	var content      = _this.CreateElement("div", "", 					{});
	var showAnswer   = _this.CreateElement("button", "", 				{float:"left", display:"none"});
	var card         = _this.CreateElement("div", "", 					{});

	parent.insertBefore(gradeDiv,nextSibling);
	_this.renderChildren(gradeDiv, null);

	parent.insertBefore(showAnswer,nextSibling);
	_this.renderChildren(showAnswer, null);

	parent.insertBefore(completeDiv,nextSibling);
	_this.renderChildren(completeDiv, null);


	//. . . . .
	var index = 0, limit= 0, activeCard = null;
	var tiddlers =this.GetScheduledCards(this.tiddler_name);
	limit = tiddlers.length;

	if(!settingsDiv.isTiddlyWikiFakeDom){
		settingsDiv.setAttribute("title", _this.twsr_scheduled_tip + String(tiddlers.length));
	}
	
	var ShowCard = function (tiddler) {
		g_twsrActive = true; //lets the other widgets know we are active

		var ShowAnswerandGrades = function(){
			content.style.display = "block";
			gradeDiv.style.display = "block";
			if(_this.questionElm){
				_this.questionElm.style.display = "none";
			}
			showAnswer.style.display = "none";
			//show all answers
			for(var a=0;a<_this.answerElm.length;a++){
				_this.answerElm[a].classList.remove("twsr_hidden");
			}
		}

		//setup globals for comms with other widgets
		g_questionElm = null;
		g_answerElm = [];
		var revealGradeAnyway = 0;
		g_answerClickCB = _this.answerClickCB = function(){
			revealGradeAnyway++;
			if(revealGradeAnyway == _this.answerElm.length){
				ShowAnswerandGrades();
			}
		}

		/////////////////////////////////////////////////////
		//render the tiddler into content div 
		var t = $tw.wiki.makeTranscludeWidget(tiddler, {document:document, variables:{"currentTiddler":tiddler}});
		content.innerHTML = card.innerHTML = "";
		if(!content.isTiddlyWikiFakeDom){
			t.render(content,null);
		}
		//hide it
		content.style.display = "none";
		//append to this flashcard
		card.appendChild(content);
		/////////////////////////////////////////////////////
		
		//copy back global data
		_this.questionElm = g_questionElm;
		_this.answerElm = g_answerElm;
		g_questionElm = null;
		g_answerElm = null;
		g_answerClickCB = null;

		//if we have a question or answer segment we need special handling
		//otherwise we just show the cards
		if(_this.questionElm || _this.answerElm.length > 0) {
			showAnswer.innerHTML = _this.twsr_show_answer;
			if(_this.questionElm){
				card.appendChild(_this.questionElm);
			}else{
				//answers only so we need to show content
				content.style.display = "block";
			}
			showAnswer.style.display = "block";
			gradeDiv.style.display = "none";
			//card.appendChild(showAnswer);
			showAnswer.onclick = ShowAnswerandGrades;
		}else{
			gradeDiv.style.display = "block";
			content.style.display = "block";
			showAnswer.style.display = "none";
		}

		activeCard = tiddler;
		g_twsrActive = false;
	}

	var AllDone = function (mgs) {
		gradeDiv.style.display = "none";
		completeDiv.style.display = "inline";
		completeDiv.innerHTML = mgs;
		content.innerHTML = "";
	}

	var OnClickGrade = function (grade) {
		if(index >= limit) return;
		activeCard = null;
		_this.UpdateCardSM2(tiddlers[index], grade);
		ShowCard(tiddlers[++index]);
		if(!settingsDiv.isTiddlyWikiFakeDom){
			settingsDiv.setAttribute("title", _this.twsr_scheduled_tip + String(tiddlers.length-index));
		}
		if(index >= limit)
		{
			index = 0, limit= 0,activeCard = null;
			tiddlers = _this.GetScheduledCards(_this.tiddler_name);
			limit = tiddlers.length;
			if(!settingsDiv.isTiddlyWikiFakeDom){
				settingsDiv.setAttribute("title", _this.twsr_scheduled_tip + String(tiddlers.length));
			}
			if(limit == 0){
				AllDone(_this.twsr_cards_finished);
			}else {
				ShowCard(tiddlers[index]);
			}
		}
	}

	var OnClickAddNew = function (amount) {
		_this.AddNewCards(amount);
		if(index >= limit)
		{
			index = 0, limit= 0,activeCard = null;
			tiddlers = _this.GetScheduledCards(_this.tiddler_name);
			limit = tiddlers.length;
			if(!settingsDiv.isTiddlyWikiFakeDom){
				settingsDiv.setAttribute("title", _this.twsr_scheduled_tip + String(tiddlers.length));
			}
			if(limit == 0){
				AllDone(_this.twsr_cards_finished);
			}else {
				gradeDiv.style.display = "none";
				completeDiv.style.display = "none";
				ShowCard(tiddlers[index]);
			}
		}
	}

	// - - - - - - - - - - - - - - - - - - - - - - - -
	// GRADES
	// - - - - - - - - - - - - - - - - - - - - - - - -

	for(key in _this.twsr_grades){
		// Create element
		var button = _this.document.createElement("button");
		// Assign classes
		var classes = _this["class"].split(" ") || [];	
		button.className = classes.join(" ");
		// Assign styles
		if(_this.style && !button.isTiddlyWikiFakeDom) {
			button.setAttribute("style", _this.style);
		}
		//set the button name
		button.innerHTML = key;
		if(!button.isTiddlyWikiFakeDom){
			button.setAttribute("title", "grade");		//set hover comment
		}
		// Add a click event handler
		button.addEventListener("click",  (function(g)
			{ 
				return function(event) {
					OnClickGrade(g);
					event.preventDefault();
					event.stopPropagation();
					return true;
				};
			})(_this.twsr_grades[key])
		, false);
		// Insert element
		gradeDiv.appendChild(button);
	}

	// - - - - - - - - - - - - - - - - - - - - - - - -
	// NEW CARDS
	// - - - - - - - - - - - - - - - - - - - - - - - -
	parent.insertBefore(settingsDiv,nextSibling);
	_this.renderChildren(settingsDiv, null);

	var contextMenu = _this.document.createElement("div");
	contextMenu.innerHTML = "";
	contextMenu.style.display = "None";
	contextMenu.style.zIndex = "1000";
	contextMenu.style.position = "absolute";
	if(!contextMenu.isTiddlyWikiFakeDom) {
		document.body.appendChild(contextMenu);
	}
	if(!contextMenu.isTiddlyWikiFakeDom) {
		//settingsDiv.oncontextmenu = 
		settingsDiv.onclick = function (event) {
			contextMenu.innerHTML = "";
			contextMenu.style.display = "block";
			contextMenu.style.top = mouseY(event) + "px";
			contextMenu.style.left = mouseX(event) + "px";
			var btns = [];
			var classes = _this["class"].split(" ") || [];	
			for(key in _this.twsr_add_new){
				// Create element
				var button = _this.document.createElement("button");
				button.className = classes.join(" ");// Assign classes
				if(_this.style && !button.isTiddlyWikiFakeDom) { // Assign styles
					button.setAttribute("style", _this.style);
				}
				//set the button name
				button.innerHTML = key;
				button.style.width = "100%";
				button.style.display = "block";
				if(!button.isTiddlyWikiFakeDo){
					button.setAttribute("title", "");		//set hover comment
				}
				// Add a click event handler
				button.addEventListener("click",  (function(g)
					{ 
						return function(event) {
							OnClickAddNew(g);
							event.preventDefault();
							event.stopPropagation();
							return true;
						};
					})(_this.twsr_add_new[key])
				, false);
				// Insert element	
				btns.push(button);
				contextMenu.appendChild(button);
			}

			{
				//ADD GOTO TIDDLER BUTTON
				var gotoTiddler = _this.document.createElement("button");
				gotoTiddler.className = classes.join(" ");
				if(_this.style && !gotoTiddler.isTiddlyWikiFakeDom) {
					gotoTiddler.setAttribute("style", _this.style);
				}
				//set the button name
				gotoTiddler.innerHTML = "tiddler";
				gotoTiddler.style.width = "100%";
				gotoTiddler.style.display = "block";

				gotoTiddler.addEventListener("click",function (event) {
					if(activeCard){
						_this.OpenTiddler(event,activeCard);
						event.preventDefault();
						event.stopPropagation();
					}
					return true;
				}, false);
				btns.push(gotoTiddler);
				contextMenu.appendChild(gotoTiddler);
			}

			function TMP(event) {
				for(var i =0;i<btns.length;i++){
					if (event.target == btns[i] ) {
						event.target.click();
					}
				}
				contextMenu.style.display = "None";
				document.removeEventListener('mousedown', TMP);
			}
			document.addEventListener('mousedown', TMP);

			return false;
		}
	}
	
	// - - - - - - - - - - - - - - - - - - - - - - - -
	// CARD DETAILS
	// - - - - - - - - - - - - - - - - - - - - - - - -
	content.innerHTML = "";
	_this.domNodes.push(card);
	parent.insertBefore(card,nextSibling);
	_this.renderChildren(card, null);
	if(tiddlers.length > 0){
		ShowCard(tiddlers[index]);
	}else{
		AllDone(_this.twsr_nothing_scheduled);
	}
}

// Render this widget into the DOM
TWSRWidget.prototype.render = function (parent,nextSibling) {
	// Remember parent
	this.parentDomNode = parent;
	// Compute attributes and execute state
	this.computeAttributes();
	this.execute();
	var self = this;
	this.ShowCards(parent,nextSibling);
};


TWSRWidget.prototype.OpenTiddler = function (event,name) {	
	var bounds = this.domNodes[0].getBoundingClientRect();
	this.dispatchEvent({
		type: "tm-navigate",
		navigateTo: name,
		navigateFromTitle: this.getVariable("storyTiddler"),
		navigateFromNode: this,
		navigateFromClientRect: {
			top: bounds.top, left: bounds.left, width: bounds.width, right: bounds.right, bottom: bounds.bottom, height: bounds.height
		},
		navigateSuppressNavigation: event.metaKey || event.ctrlKey || (event.button === 1)
	});
};

//Compute the internal state of the widget
TWSRWidget.prototype.execute = function () {
	//other genral attributes
	this.InitTWSR();
	this["class"] = this.getAttribute("class", "");
	this.style = this.getAttribute("style");
	this.selectedClass = this.getAttribute("selectedClass");
	this.defaultSetValue = this.getAttribute("default");
	// Make child widgets
	this.makeChildWidgets();	
};

TWSRWidget.prototype.GetConfigTiddlers = function ()
{
	var target_tiddler = $tw.wiki.getTiddler(this.tiddler_name);
	var target_tags = target_tiddler.getFieldList("tags");

	var filter = "[all[tiddlers+shadows]tag[$:/tags/twsr/config]]";
	var tiddlers = $tw.wiki.filterTiddlers(filter);
	this.twsr_grades = {};
	for(i = 0;i<tiddlers.length;i++){
		var valid = false;
		var tiddler = $tw.wiki.getTiddler(tiddlers[i]);

		var names 		= tiddler.getFieldList("twsr_cfg_grade_names");	
		var numbers 	= tiddler.getFieldList("twsr_cfg_grade_numbers");	

		var add_new 			= tiddler.getFieldList("twsr_cfg_add_new");	
		var tags 				= tiddler.getFieldList("twsr_cfg_tags");	
		var ignore_tags 		= tiddler.getFieldList("twsr_cfg_ignore_tags");	
		var show_answer 		= tiddler.getFieldString("twsr_cfg_show_answer");	
		var scheduled_tip 		= tiddler.getFieldString("twsr_cfg_cards_scheduled")+ " ";	
		var finished 			= tiddler.getFieldString("twsr_cfg_cards_finished")+ " ";	
		var nothing_scheduled 	= tiddler.getFieldString("twsr_cfg_nothing_scheduled")+ " ";	

		var common_tags 		= target_tags.filter(function(value) { 
			return tags.indexOf(value) > -1;
		});

		//we match the exact number of tags
		if(common_tags.length == tags.length){
			if(names.length == numbers.length){
				for(g=0;g<names.length;g++){
					this.twsr_grades[names[g]] = numbers[g];
				}
				this.twsr_tags = common_tags;
				this.twsr_ignore_tags = ignore_tags;

				//this.twsr_tags.push("$:/tags/twsr");
				this.twsr_add_new = {};
				for(g=0;g<add_new.length;g++){
					this.twsr_add_new["+"+add_new[g]] = add_new[g];
				}

				this.twsr_show_answer = show_answer;
				this.twsr_scheduled_tip = scheduled_tip;
				this.twsr_cards_finished = finished;
				this.twsr_nothing_scheduled = nothing_scheduled;
				break; //we found our matching config, ignore further matches
			}
			else{
				console.log("tswr config tiddler : " + tiddler.getFieldString("title") + "malformed, grade names do not match numbers")
			}
		}else{
			console.log("tswr config tiddler : " + tiddler.getFieldString("title") + "no matching tags :" + target_tags + " " + tags)
		}
	}
}

TWSRWidget.prototype.InitTWSR = function ()
{
	//try to get from marco, is missing try to get from the 
	this.tiddler_name = this.getAttribute(g_src,this.getVariable("currentTiddler"));
	this.questionElm = null;
	this.answerElm = [];
	this.answerClickCB = null;
	//get the config tiddlers and find out what we need
	this.GetConfigTiddlers()
}

//Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
TWSRWidget.prototype.refresh = function (changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	if (changedAttributes["class"] || changedAttributes.selectedClass || changedAttributes.style || changedAttributes.tiddler_name) {
		this.refreshSelf();
		return true;
	}
	return this.refreshChildren(changedTiddlers);
};

/////////////////////////////////////////////////////////////////////////////////////////////////////
// Question Widget
// if twsr is active we hide whatever isn't in the qustion segment until the user clicks shows answer
/////////////////////////////////////////////////////////////////////////////////////////////////////

var TWSRQuestion = function(parseTreeNode,options) {
	this.initialise(parseTreeNode, options);
};

TWSRQuestion.prototype = new Widget(); //Inherit from the base widget class

//Render this widget into the DOM
TWSRQuestion.prototype.render = function(parent,nextSibling) {
	if(g_twsrActive){
		g_questionElm = this.document.createElement("div");
		Widget.prototype.render.call(this, g_questionElm, nextSibling);
	}
};

/////////////////////////////////////////////////////////////////////////////////////////////////////
// Answer Widget
// if twsr is active we hide whatever is in the answer segment unless the user clicks on it
/////////////////////////////////////////////////////////////////////////////////////////////////////

var TWSRAnswer = function(parseTreeNode,options) {
	this.initialise(parseTreeNode, options);
};

TWSRAnswer.prototype = new Widget(); //Inherit from the basey widget class

//Render this widget into the DOM
TWSRAnswer.prototype.render = function(parent,nextSibling) {
	var locallyActive  = false;
	if(!g_twsrActive){
		var tags = $tw.wiki.getTiddler(this.getVariable("currentTiddler")).getFieldList("tags");
		if(tags.indexOf("$:/tags/twsr/hideAnswer") >= 0 || tags.indexOf("$:/tags/twsr/hideAnswers") >= 0){
			locallyActive = true;
		}
	}

	if(g_twsrActive || locallyActive){
		this.computeAttributes();
		var cb = locallyActive ? function(){} : g_answerClickCB;
		this.computeAttributes();
		var useSpan = this.hasAttribute("s");
		var tmp = this.document.createElement(useSpan ? "span" : "div");
		tmp.classList.add("twsr_answer");
		tmp.classList.add("twsr_hidden");
		function ClickEvent(event) {
			tmp.classList.remove("twsr_hidden");
			event.preventDefault();
			event.stopPropagation();
			cb();
			tmp.removeEventListener("click", ClickEvent, true);
			return true;
		}
		tmp.addEventListener("click", ClickEvent, true);
		Widget.prototype.render.call(this, tmp, nextSibling);
		parent.appendChild(tmp);
		if(!locallyActive){
			g_answerElm.push(tmp);
		}
	}else{
		Widget.prototype.render.call(this, parent, nextSibling);
	}
};

/////////////////////////////////////////////////////////////////////////////////////////////////////
// Ruby Widget
// shortcut for getting ruby format
/////////////////////////////////////////////////////////////////////////////////////////////////////

var TWSRRuby = function(parseTreeNode,options) {
	this.initialise(parseTreeNode, options);
};

TWSRRuby.prototype = new Widget(); //Inherit from the basey widget class

//Compute the internal state of the widget
TWSRRuby.prototype.execute = function() {
	Widget.prototype.execute.call(this);
	//left here for future reference

	// this.makeChildWidgets([{
	// 	type: "answer",
	// 	attributes: this.parseTreeNode.attributes,
	
	// 	children: this.parseTreeNode.children
	// }]);	y

}

//Render this widget into the DOM
TWSRRuby.prototype.render = function(parent,nextSibling) {
	if(!("twsrruby" in this.parseTreeNode)){
		this.parentDomNode = parent;
		this.computeAttributes();
		var upper = this.getAttribute("u");
		var useAnswer = !this.hasAttribute("na");

		var tags = $tw.wiki.getTiddler(this.getVariable("currentTiddler")).getFieldList("tags");
		if(tags.indexOf("$:/tags/twsr/noRubyAnswer") > 0){
				useAnswer = false;
		}
		
		var wikiParser = $tw.wiki.parseText("text/vnd.tiddlywiki", "<ruby>twsr_replace_me<rt>"+(useAnswer?"<$a s>":"")+upper+(useAnswer?"</$a>":"")+"</rt></ruby>", {parseAsInline: true});

		var newTree = wikiParser.tree;
		var temp = newTree[0].children[1];
		newTree[0].children = this.parseTreeNode.children;
		newTree[0].children.push(temp);
		this.parseTreeNode.children = newTree;
		this.parseTreeNode["twsrruby"] = true;
	}
	Widget.prototype.render.call(this, parent, nextSibling);
};


/////////////////////////////////////////////////////////////////////////////////////////////////////

exports.twsr = TWSRWidget;
exports.question = TWSRQuestion;
exports.answer = TWSRAnswer;
exports.ruby = TWSRRuby;
exports.q = TWSRQuestion;
exports.a = TWSRAnswer;
exports.r = TWSRRuby;

})();
