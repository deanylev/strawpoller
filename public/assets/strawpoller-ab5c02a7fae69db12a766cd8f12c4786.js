"use strict"
define("strawpoller/app",["exports","strawpoller/resolver","ember-load-initializers","strawpoller/config/environment"],function(e,t,n,r){Object.defineProperty(e,"__esModule",{value:!0})
var o=Ember.Application.extend({modulePrefix:r.default.modulePrefix,podModulePrefix:r.default.podModulePrefix,Resolver:t.default});(0,n.default)(o,r.default.modulePrefix),e.default=o}),define("strawpoller/components/route-create/component",["exports","strawpoller/config/environment"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.Component.extend({router:Ember.inject.service(),socket:Ember.inject.service(),topic:"",allowEditing:!1,editPassword:"",options:null,disabled:Ember.computed("topic","options.[]","options.@each.name","editPassword","allowEditing","socket.connected",function(){return!(this.get("topic")&&this.get("options").filter(function(e){return e.name}).length>=2&&(this.get("editPassword")||!this.get("allowEditing"))&&this.get("socket.connected"))}),init:function(){this._super.apply(this,arguments),this.set("options",[])},actions:{addOption:function(){this.get("options").pushObject({name:""})},removeOption:function(e){this.set("options",this.get("options").filter(function(t,n){return n!==e}))},createPoll:function(){var e=this
return this.get("socket").sendFrame("create poll",{topic:this.get("topic"),options:this.get("options").filter(function(e){return e.name}),allow_editing:this.get("allowEditing")?1:0,edit_password:this.get("editPassword")}).then(function(t){e.get("router").transitionTo("view",t.id)})}}})}),define("strawpoller/components/route-create/template",["exports"],function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.HTMLBars.template({id:"nNbzJvlI",block:'{"symbols":["option","index"],"statements":[[6,"form"],[7],[0,"\\n  "],[6,"div"],[9,"class","form-group"],[7],[0,"\\n    "],[1,[25,"textarea",null,[["class","value","placeholder"],["form-control",[20,["topic"]],"Enter a topic"]]],false],[0,"\\n  "],[8],[0,"\\n  "],[6,"div"],[9,"class","form-check"],[7],[0,"\\n    "],[1,[25,"input",null,[["id","class","type","checked"],["allow-editing","form-check-input","checkbox",[20,["allowEditing"]]]]],false],[0,"\\n    "],[6,"label"],[9,"class","form-check-label"],[9,"for","allow-editing"],[7],[0,"Allow editing?"],[8],[0,"\\n  "],[8],[0,"\\n  "],[6,"br"],[7],[8],[0,"\\n"],[4,"if",[[20,["allowEditing"]]],null,{"statements":[[0,"    "],[6,"div"],[9,"class","form-group"],[7],[0,"\\n      "],[1,[25,"input",null,[["class","type","value","placeholder"],["form-control","password",[20,["editPassword"]],"Enter an edit password"]]],false],[0,"\\n    "],[8],[0,"\\n"]],"parameters":[]},null],[4,"if",[[20,["options"]]],null,{"statements":[[0,"    "],[6,"h2"],[7],[0,"Options"],[8],[0,"\\n"],[4,"each",[[20,["options"]]],null,{"statements":[[0,"      "],[6,"div"],[9,"class","form-group"],[7],[0,"\\n        "],[1,[25,"input",null,[["class","type","value","placeholder"],["form-control","text",[19,1,["name"]],"Enter an option"]]],false],[0,"\\n        "],[6,"br"],[7],[8],[0,"\\n        "],[6,"button"],[9,"class","btn btn-danger"],[3,"action",[[19,0,[]],"removeOption",[19,2,[]]]],[7],[0,"Delete"],[8],[0,"\\n      "],[8],[0,"\\n"]],"parameters":[1,2]},null]],"parameters":[]},null],[0,"  "],[6,"br"],[7],[8],[0,"\\n  "],[6,"button"],[9,"class","btn btn-primary"],[3,"action",[[19,0,[]],"addOption"]],[7],[0,"+ Add Option"],[8],[0,"\\n  "],[6,"br"],[7],[8],[6,"br"],[7],[8],[0,"\\n  "],[4,"spin-button",null,[["class","buttonStyle","action","disabled"],["btn btn-success btn-block btn-lg","zoom-out",[25,"action",[[19,0,[]],"createPoll"],null],[20,["disabled"]]]],{"statements":[[0,"Create"]],"parameters":[]},null],[0,"\\n"],[8],[0,"\\n"]],"hasEval":false}',meta:{moduleName:"strawpoller/components/route-create/template.hbs"}})}),define("strawpoller/components/route-edit/component",["exports","strawpoller/config/environment"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.Component.extend({router:Ember.inject.service(),socket:Ember.inject.service(),unlocked:!1,editPassword:"",error:"",topic:"",options:null,disabled:Ember.computed("topic","options.[]","options.@each.name","editPassword","socket.connected",function(){return!(this.get("topic")&&this.get("options").filter(function(e){return e.name}).length>=2&&this.get("editPassword")&&this.get("socket.connected"))}),actions:{submitPassword:function(){var e=this
return this.get("socket").sendFrame("unlock poll",{id:this.get("poll_id"),password:this.get("editPassword")}).then(function(t){e.set("topic",t.topic),e.set("options",t.options),e.set("unlocked",!0)}).catch(function(t){return e.set("error",t.error)})},addOption:function(){this.get("options").pushObject({name:""})},removeOption:function(e){this.set("options",this.get("options").filter(function(t,n){return n!==e}))},savePoll:function(){var e=this
return new Ember.RSVP.Promise(function(t,n){e.get("socket").sendFrame("edit poll",{id:e.get("poll_id"),topic:e.get("topic"),edit_password:e.get("editPassword"),options:e.get("options").filter(function(e){return e.name})}).then(function(){return e.get("router").transitionTo("view",e.get("poll_id"))})})}}})}),define("strawpoller/components/route-edit/template",["exports"],function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.HTMLBars.template({id:"Kn+MlmfV",block:'{"symbols":["option","index"],"statements":[[6,"form"],[7],[0,"\\n"],[4,"if",[[20,["unlocked"]]],null,{"statements":[[0,"    "],[6,"div"],[9,"class","form-group"],[7],[0,"\\n      "],[1,[25,"textarea",null,[["class","value","placeholder"],["form-control",[20,["topic"]],"Enter a topic"]]],false],[0,"\\n    "],[8],[0,"\\n    "],[6,"br"],[7],[8],[0,"\\n    "],[6,"div"],[9,"class","form-group"],[7],[0,"\\n      "],[1,[25,"input",null,[["class","type","value","placeholder"],["form-control","password",[20,["editPassword"]],"Enter an edit password"]]],false],[0,"\\n    "],[8],[0,"\\n"],[4,"if",[[20,["options"]]],null,{"statements":[[0,"      "],[6,"h2"],[7],[0,"Options"],[8],[0,"\\n"],[4,"each",[[20,["options"]]],null,{"statements":[[0,"        "],[6,"div"],[9,"class","form-group"],[7],[0,"\\n          "],[1,[25,"input",null,[["class","type","value","placeholder"],["form-control","text",[19,1,["name"]],"Enter an option"]]],false],[0,"\\n        "],[8],[0,"\\n"]],"parameters":[1,2]},null]],"parameters":[]},null],[0,"    "],[6,"br"],[7],[8],[6,"br"],[7],[8],[0,"\\n    "],[4,"spin-button",null,[["class","buttonStyle","action","disabled"],["btn btn-success btn-block btn-lg","zoom-out",[25,"action",[[19,0,[]],"savePoll"],null],[20,["disabled"]]]],{"statements":[[0,"Save"]],"parameters":[]},null],[0,"\\n"]],"parameters":[]},{"statements":[[0,"    "],[1,[25,"input",null,[["class","type","value","placeholder"],["form-control","password",[20,["editPassword"]],"Enter the edit password"]]],false],[0,"\\n    "],[6,"br"],[7],[8],[0,"\\n"],[4,"if",[[20,["error"]]],null,{"statements":[[0,"      "],[6,"p"],[9,"class","text-danger"],[7],[1,[18,"error"],false],[8],[0,"\\n"]],"parameters":[]},null],[0,"    "],[4,"spin-button",null,[["class","buttonStyle","action","disabled"],["btn btn-primary btn-block btn-lg","zoom-out",[25,"action",[[19,0,[]],"submitPassword"],null],[25,"or",[[25,"not",[[20,["editPassword"]]],null],[20,["socket","disconnected"]]],null]]],{"statements":[[0,"Submit"]],"parameters":[]},null],[0,"\\n"]],"parameters":[]}],[8],[0,"\\n"]],"hasEval":false}',meta:{moduleName:"strawpoller/components/route-edit/template.hbs"}})}),define("strawpoller/components/route-view/component",["exports","strawpoller/config/environment"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.Component.extend({socket:Ember.inject.service(),initialLoad:!1,topic:"",options:[],handleData:null,pie:null,pieData:Ember.computed("options.@each.votes",function(){return this.get("options").map(function(e){return{label:e.name,value:e.votes}})}),votesDidChange:Ember.observer("options.@each.votes",function(){this.get("pie")&&this.get("pie").updateProp("data.content",this.get("pieData"))}),init:function(){var e=this
this._super.apply(this,arguments),this.set("handleData",function(t){if(e.set("topic",t.topic),e.set("options",t.options),!e.get("initialLoad")){var n=new d3pie("pie",{effects:{load:{effect:"none"},pullOutSegmentOnClick:{effect:"none"}},data:{content:e.get("pieData")}})
e.set("pie",n),e.set("initialLoad",!0)}}),this.get("socket").sendFrame("view poll",this.get("poll_id")),this.get("socket").registerListener("poll data",this.handleData)},willDestroy:function(){this.get("socket").unregisterListener("poll data",this.handleData),this._super.apply(this,arguments)},actions:{vote:function(e){var t=this
this.get("options").filter(function(t){return t.selected&&t.id!==e}).forEach(function(e){t.get("socket").sendFrame("remove vote",{id:e.id}).then(function(){return Ember.set(e,"selected",!1)})})
var n=this.get("options").find(function(t){return t.id===e})
this.get("socket").sendFrame(n.selected?"remove vote":"add vote",{id:e}).then(function(){return Ember.set(n,"selected",!n.selected)})}}})}),define("strawpoller/components/route-view/template",["exports"],function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.HTMLBars.template({id:"XFMZe8DV",block:'{"symbols":["option"],"statements":[[6,"br"],[7],[8],[0,"\\n"],[4,"if",[[20,["initialLoad"]]],null,{"statements":[[0,"  "],[6,"h2"],[7],[1,[18,"topic"],false],[8],[0,"\\n  "],[6,"br"],[7],[8],[0,"\\n"],[4,"each",[[20,["options"]]],null,{"statements":[[0,"    "],[6,"div"],[10,"class",[26,["vote text-light ",[25,"if",[[19,1,["selected"]],"bg-success","bg-dark"],null]]]],[3,"action",[[19,0,[]],"vote",[19,1,["id"]]],[["on"],["click"]]],[7],[0,"\\n      "],[6,"h5"],[7],[1,[19,1,["name"]],false],[0,":"],[8],[0,"\\n      "],[6,"p"],[7],[1,[19,1,["votes"]],false],[0," votes"],[8],[0,"\\n    "],[8],[0,"\\n"]],"parameters":[1]},null]],"parameters":[]},{"statements":[[0,"  "],[6,"h2"],[7],[0,"Loading..."],[8],[0,"\\n"]],"parameters":[]}],[6,"div"],[9,"id","pie"],[7],[8],[0,"\\n"]],"hasEval":false}',meta:{moduleName:"strawpoller/components/route-view/template.hbs"}})}),define("strawpoller/components/spin-button",["exports","ember-spin-button2/components/spin-button"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}})}),define("strawpoller/helpers/and",["exports","ember-truth-helpers/helpers/and"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"and",{enumerable:!0,get:function(){return t.and}})}),define("strawpoller/helpers/app-version",["exports","strawpoller/config/environment","ember-cli-app-version/utils/regexp"],function(e,t,n){function r(e){var r=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},o=t.default.APP.version,l=r.versionOnly||r.hideSha,i=r.shaOnly||r.hideVersion,s=null
return l&&(r.showExtended&&(s=o.match(n.versionExtendedRegExp)),s||(s=o.match(n.versionRegExp))),i&&(s=o.match(n.shaRegExp)),s?s[0]:o}Object.defineProperty(e,"__esModule",{value:!0}),e.appVersion=r,e.default=Ember.Helper.helper(r)}),define("strawpoller/helpers/eq",["exports","ember-truth-helpers/helpers/equal"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"equal",{enumerable:!0,get:function(){return t.equal}})}),define("strawpoller/helpers/gt",["exports","ember-truth-helpers/helpers/gt"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"gt",{enumerable:!0,get:function(){return t.gt}})}),define("strawpoller/helpers/gte",["exports","ember-truth-helpers/helpers/gte"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"gte",{enumerable:!0,get:function(){return t.gte}})}),define("strawpoller/helpers/is-array",["exports","ember-truth-helpers/helpers/is-array"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"isArray",{enumerable:!0,get:function(){return t.isArray}})}),define("strawpoller/helpers/is-equal",["exports","ember-truth-helpers/helpers/is-equal"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"isEqual",{enumerable:!0,get:function(){return t.isEqual}})}),define("strawpoller/helpers/lt",["exports","ember-truth-helpers/helpers/lt"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"lt",{enumerable:!0,get:function(){return t.lt}})}),define("strawpoller/helpers/lte",["exports","ember-truth-helpers/helpers/lte"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"lte",{enumerable:!0,get:function(){return t.lte}})}),define("strawpoller/helpers/not-eq",["exports","ember-truth-helpers/helpers/not-equal"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"notEq",{enumerable:!0,get:function(){return t.notEq}})}),define("strawpoller/helpers/not",["exports","ember-truth-helpers/helpers/not"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"not",{enumerable:!0,get:function(){return t.not}})}),define("strawpoller/helpers/or",["exports","ember-truth-helpers/helpers/or"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"or",{enumerable:!0,get:function(){return t.or}})}),define("strawpoller/helpers/pluralize",["exports","ember-inflector/lib/helpers/pluralize"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),e.default=t.default}),define("strawpoller/helpers/singularize",["exports","ember-inflector/lib/helpers/singularize"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),e.default=t.default}),define("strawpoller/helpers/xor",["exports","ember-truth-helpers/helpers/xor"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}}),Object.defineProperty(e,"xor",{enumerable:!0,get:function(){return t.xor}})}),define("strawpoller/initializers/app-version",["exports","ember-cli-app-version/initializer-factory","strawpoller/config/environment"],function(e,t,n){Object.defineProperty(e,"__esModule",{value:!0})
var r=void 0,o=void 0
n.default.APP&&(r=n.default.APP.name,o=n.default.APP.version),e.default={name:"App Version",initialize:(0,t.default)(r,o)}}),define("strawpoller/initializers/container-debug-adapter",["exports","ember-resolver/resolvers/classic/container-debug-adapter"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),e.default={name:"container-debug-adapter",initialize:function(){var e=arguments[1]||arguments[0]
e.register("container-debug-adapter:main",t.default),e.inject("container-debug-adapter:main","namespace","application:main")}}}),define("strawpoller/initializers/ember-data",["exports","ember-data/setup-container","ember-data"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),e.default={name:"ember-data",initialize:t.default}}),define("strawpoller/initializers/export-application-global",["exports","strawpoller/config/environment"],function(e,t){function n(){var e=arguments[1]||arguments[0]
if(!1!==t.default.exportApplicationGlobal){var n
if("undefined"!=typeof window)n=window
else if("undefined"!=typeof global)n=global
else{if("undefined"==typeof self)return
n=self}var r,o=t.default.exportApplicationGlobal
r="string"==typeof o?o:Ember.String.classify(t.default.modulePrefix),n[r]||(n[r]=e,e.reopen({willDestroy:function(){this._super.apply(this,arguments),delete n[r]}}))}}Object.defineProperty(e,"__esModule",{value:!0}),e.initialize=n,e.default={name:"export-application-global",initialize:n}}),define("strawpoller/instance-initializers/ember-data",["exports","ember-data/initialize-store-service"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),e.default={name:"ember-data",initialize:t.default}}),define("strawpoller/resolver",["exports","ember-resolver"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),e.default=t.default}),define("strawpoller/router",["exports","strawpoller/config/environment"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0})
var n=Ember.Router.extend({location:t.default.locationType,rootURL:t.default.rootURL})
n.map(function(){this.route("create",{path:"/"}),this.route("view",{path:"/view/:poll_id"}),this.route("edit",{path:"/edit/:poll_id"})}),e.default=n})
define("strawpoller/routes/create",["exports"],function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.Route.extend({})}),define("strawpoller/routes/edit",["exports"],function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.Route.extend({model:function(e){return{poll_id:e.poll_id}},renderTemplate:function(){this.render({into:"application"})}})}),define("strawpoller/routes/view",["exports"],function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.Route.extend({model:function(e){return{poll_id:e.poll_id}},renderTemplate:function(){this.render({into:"application"})}})}),define("strawpoller/services/ajax",["exports","ember-ajax/services/ajax"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),Object.defineProperty(e,"default",{enumerable:!0,get:function(){return t.default}})}),define("strawpoller/services/socket",["exports","strawpoller/config/environment"],function(e,t){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.Service.extend({socket:null,connected:!1,disconnected:Ember.computed.not("connected"),init:function(){var e=this
this._super.apply(this,arguments),this.set("socket",io(t.default.APP.SOCKET_HOST)),this.get("socket").on("connect",function(){return e.set("connected",!0)}),this.get("socket").on("disconnect",function(){return e.set("connected",!1)})},sendFrame:function(e,t){var n=this
return new Ember.RSVP.Promise(function(r,o){n.get("socket").emit(e,t,function(e,t){e?r(t):o(t)})})},registerListener:function(e,t){this.get("socket").on(e,t)},unregisterListener:function(e,t){this.get("socket").off(e,t)}})}),define("strawpoller/templates/application",["exports"],function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.HTMLBars.template({id:"rPeey7ca",block:'{"symbols":[],"statements":[[6,"div"],[9,"class","container text-center"],[7],[0,"\\n  "],[6,"h1"],[7],[4,"link-to",["create"],[["class"],["text-dark"]],{"statements":[[0,"Strawpoller"]],"parameters":[]},null],[8],[0,"\\n  "],[1,[18,"outlet"],false],[0,"\\n"],[8],[0,"\\n"]],"hasEval":false}',meta:{moduleName:"strawpoller/templates/application.hbs"}})}),define("strawpoller/templates/create",["exports"],function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.HTMLBars.template({id:"cIi4rU+E",block:'{"symbols":[],"statements":[[1,[18,"route-create"],false],[0,"\\n"]],"hasEval":false}',meta:{moduleName:"strawpoller/templates/create.hbs"}})}),define("strawpoller/templates/edit",["exports"],function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.HTMLBars.template({id:"mMtct9Ha",block:'{"symbols":[],"statements":[[1,[25,"route-edit",null,[["poll_id"],[[20,["model","poll_id"]]]]],false],[0,"\\n"]],"hasEval":false}',meta:{moduleName:"strawpoller/templates/edit.hbs"}})}),define("strawpoller/templates/view",["exports"],function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=Ember.HTMLBars.template({id:"Al+7SfRo",block:'{"symbols":[],"statements":[[1,[25,"route-view",null,[["poll_id"],[[20,["model","poll_id"]]]]],false],[0,"\\n"]],"hasEval":false}',meta:{moduleName:"strawpoller/templates/view.hbs"}})}),define("strawpoller/config/environment",[],function(){try{var e="strawpoller/config/environment",t=document.querySelector('meta[name="'+e+'"]').getAttribute("content"),n={default:JSON.parse(unescape(t))}
return Object.defineProperty(n,"__esModule",{value:!0}),n}catch(t){throw new Error('Could not read config from meta tag with name "'+e+'".')}}),runningTests||require("strawpoller/app").default.create({SOCKET_HOST:"/",name:"strawpoller",version:"0.0.0+f4e1575d"})
