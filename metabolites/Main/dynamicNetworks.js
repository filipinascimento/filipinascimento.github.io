
"use strict";

async function startVisualization() {
	var canvas = d3.select("#networkView").append("canvas");
	var svg = d3.select("#networkView").append("svg").attr("class", "plot");
	
	let extraDataset = await d3.json("Data/data.json");

	let width = 100;
	let height = 100;

	let startIndex = 3;
	let currentNetwork;
	let currentIndex = startIndex;
	let color = d3.scaleOrdinal(d3.schemeCategory10);
	
	
	let displayProperties = ["Label"];
	
	let sizeProperty = "degree";
	let IDProperty = "Label";
	let colorProperty = "Louvain Layered";

	let startYear = 0;
	let endYear = 0;
	let networkName;

	let selectedNodes = new Set();
	let hoverNode = null;
	let useDarkBackground = false;
	let renderLinksSVG = false;
	let renderLinksCanvas = true;
	let renderLinksGL = false;
	let renderGradientLinks = false;

	let dpr = 1.0;
	let zoomScale = 0.95;
	let scaleFactor = 0.0;
	let targetScaleFactor = 1.0;
	let linesIntensity = 0.1;
	let linesWidth = 1.0;
	let maxNodeSize = 10;
	let minNodeSize = 4;
	let sizePowerCoeff = 2.0;

	let maxWidthSize = 4;
	let minWidthSize = 1.5;
	let widthPowerCoeff = 2.0;

	let maxLineOpacity = 0.5;
	let minLineOpacity= 0.05;

	let maxStrength = 8;
	let minStrength = 2;
	let needsUpdate = false;
	let forceStrength = 1.0;

	let xscale = d3.scaleLinear();
	let yscale = d3.scaleLinear();

	let edgesIndices = null;
	let positionArray = null;
	let colorArray = null;
	let indexType = null;
	let edgesBuffer = null;
	let positionsBuffer = null;
	let colorsBuffer = null;
	let intensitiesBuffer = null;
	let edgesShaderProgram = null;


	d3.select('#saveSVGButton').on('click', function () {
		var config = {
			filename: currentNetwork.name,
		}
		if (!renderLinksSVG) {
			createSVGLinks();
			updateSVGLinks(100.0);
		}
		let toSaveSVG = d3.select("#networkView").append("svg")
			.classed("plot", true)
			.attr("width", width)
			.attr("height", height)
			.html(d3.select("svg").html());
		d3_save_svg.save(toSaveSVG.node(), config);
		toSaveSVG.remove();

		if (!renderLinksSVG) {
			deleteSVGLinks();
		}
	});

	let gl;
	if (renderLinksGL) {
		gl = createWebGLContext(canvas.node(), { antialias: true, powerPreference :"high-performance",desynchronized:true});
		let edgesShaderVertex = await getShader(gl, "edges-vertex");
		let edgesShaderFragment = await getShader(gl, "edges-fragment");

		edgesShaderProgram = new ShaderProgram(edgesShaderVertex, edgesShaderFragment,
			["linesIntensity"],
			["vertex", "color"],
			gl);
		indexType = gl.UNSIGNED_SHORT;
		edgesBuffer = gl.createBuffer();
		positionsBuffer = gl.createBuffer();
		colorsBuffer = gl.createBuffer();
		intensitiesBuffer = gl.createBuffer();
	}
	window.gl = gl;



	// if(!svgDefs)
	let svgDefs = svg.append('defs');
	let existingDef = new Set();
	let gradient = (colorFrom, colorTo) => {
		colorFrom = d3.rgb(colorFrom).hex();
		colorTo = d3.rgb(colorTo).hex();
		let gradientName = "grad" + colorFrom.replace("#", "") + colorTo.replace("#", "");
		if (!existingDef.has(gradientName)) {
			let mainGradient = svgDefs.append('linearGradient')
				.attr('id', gradientName)
				.attr('x1', "0%")
				.attr('x2', "100%")
				.attr('y1', "0%")
				.attr('y2', "100%");

			mainGradient.append('stop')
				.style("stop-color", colorFrom)
				.attr('offset', '0%');

			mainGradient.append('stop')
				.style("stop-color", colorTo)
				.attr('offset', '100%');

			existingDef.add(gradientName);
		}
		return "url(#" + gradientName + ")";
	};

	let nodes = [];
	let links = [];


	let forceLinks = 
			d3.forceLink(links)
				.id(d => d.id);
	forceLinks.strength(d=>forceStrength*d.weight/Math.min(d.target.neigh.length, d.source.neigh.length))
	forceLinks.distance(1);
							
	var simulation = d3.forceSimulation(nodes)
		.force("charge", d3.forceManyBody()
		.strength(d=> -((1-d.sizeFactor)*minStrength+(d.sizeFactor)*maxStrength))
		// .strength(-20)
		// 	// .distanceMin(0.1)
		// 	// .theta(0.5)
		)
		.force("link",forceLinks)
		.force("center", d3.forceCenter(0, 0))
		.force("x", d3.forceX().strength(0.10))
		.force("y", d3.forceY().strength(0.10))
		// .force('collision', d3.forceCollide().radius(d=> d.size*2))
		// .alphaTarget(10)
		.alphaDecay(0.002)
		.velocityDecay(0.6)
		.on("tick", ()=>{needsUpdate=true;});


	var g = svg.append("g");


	let linksView = g.append("g").attr("stroke", "#000").attr("stroke-width", 1.5).selectAll(".link");


	let nodesView = g.append("g").selectAll(".node");

	let selectedView = g.append("g").selectAll(".nodesSelected");


	let legendView = svg.append("g")
		.classed("legend",true)
		.attr("transform", "translate(10," + "10" + ")");

	let nodeByID = {};
	let hoverTextBox = svg.append("g");

	let hoverText = hoverTextBox
		.append("text")
		.attr("text-anchor","end");

	function setDrawNetwork(network,networkIndex) {
		currentIndex = networkIndex;
		currentNetwork = network;
		let newNodes = [];
		let nodesDictionary = {};
		let ID2Nodes = {};
		links = [];
		let majorComponentSet = new Set();
		nodeByID = {};
		for (let index = 0; index < network.nodesCount; index++) {
			let inMajorComponent = false;
			if (network.verticesProperties.community) {
				if (network.verticesProperties.community[index] >= 0) {
					majorComponentSet.add(index);
					inMajorComponent = true;
				}
			} else {
				majorComponentSet.add(index);
				inMajorComponent = true;
			}

			if (inMajorComponent) {
				let node = {
					"id": IDProperty?network.verticesProperties[IDProperty][index]:(network.names ? network.names[index] : index),
				}
				nodeByID[node["id"]] = node; 
				for (let attribute in network.verticesProperties) {
					if (network.verticesProperties.hasOwnProperty(attribute)) {
						let element = network.verticesProperties[attribute];
						node[attribute] = element[index];
					}
				}
				if(network.names){
					node["name"] = network.names[index]
				}
				node.index = newNodes.length;
				node.neigh = [];
				node.strength = 0;
				newNodes.push(node);
				nodesDictionary[index] = node;
				ID2Nodes[node.id] = node;
			}
		}

		for (let index = 0; index < network.edges.length; index++) {
			let edge = network.edges[index];
			if (majorComponentSet.has(edge[0]) && majorComponentSet.has(edge[1])) {
				let fromNode = nodesDictionary[edge[0]];
				let toNode = nodesDictionary[edge[1]];

				let edgeObject = {
					source: fromNode,
					target: toNode,
					weight: network.weights?network.weights[index]:1.0,
				}
				fromNode.neigh.push(toNode);
				toNode.neigh.push(fromNode);
				fromNode.strength=edgeObject.weight;
				toNode.strength=edgeObject.weight;
				links.push(edgeObject);
			}
		}

		nodes.forEach(node => {
			let previousID = node.id;
			if (ID2Nodes.hasOwnProperty(previousID)) {
				let newNode = ID2Nodes[previousID];
				newNode.x = node.x;
				newNode.y = node.y;
				newNode.vx = node.vx;
				newNode.vy = node.vy;
				newNode.existed = true;
			}
		});

		newNodes.forEach(node => {
			let sumX = 0;
			let sumY = 0;
			let sumVX = 0;
			let sumVY = 0;
			let sumCount = 0;
			if (!node.existed) {
				node.neigh.forEach(neighNode => {
					if (neighNode.existed) {
						sumX += neighNode.x;
						sumY += neighNode.y;
						sumVX += neighNode.vx;
						sumVY += neighNode.vy;
						sumCount++;
					}
				});
				node.x = sumX / sumCount;
				node.y = sumVY / sumCount;
				node.vx = sumVX / sumCount;
				node.vy = sumVY / sumCount;
			}
		});

		nodes = newNodes;
	}




	function contains(a, obj) {
		var i = a.length;
		while (i--) {
			if (a[i] === obj) {
				return true;
			}
		}
		return false;
	}



	function restart() {
		if(timelines){
			nodes.forEach(d => {
				let communityInTime = d[colorProperty]+"_"+currentIndex;
				d.color = color(timelines[communityInTime]);
				d.timeline = timelines[communityInTime];
				// if (propertyToColor.hasOwnProperty(d[colorProperty])) {
				// 	d.color = propertyToColor[d[colorProperty]];
				// } else {
				// 	if (useDarkBackground) {
				// 		d.color = "#333333";
				// 	} else {
				// 		d.color = "#cccccc";
				// 	}
				// }
			});
		}else{
			color = d3.scaleOrdinal(d3.schemeCategory10);
			let topColorProperties = sortByFrequency(nodes.map(d=>d[colorProperty])).slice(0, 10);
			let propertyToColor = {};
			topColorProperties.forEach(d=> propertyToColor[d] = color(d));
			nodes.forEach(d => {
				if (propertyToColor.hasOwnProperty(d[colorProperty])) {
					d.color = propertyToColor[d[colorProperty]];
				} else {
					if (useDarkBackground) {
						d.color = "#333333";
					} else {
						d.color = "#cccccc";
					}
				}
			});
		}

		let nodesSizes = [];
		nodes.forEach(d => {
			d.size = maxNodeSize;
			d.degrees = 0;
			if(sizeProperty=="degree"){
				d.sizeRaw = 0
			}else{
				d.sizeRaw = +d[sizeProperty];
			}
		});
		//Degrees as color:
		links.forEach(d => {
			d.source.degrees+=d.weight;
			d.target.degrees+=d.weight;
			if(sizeProperty=="degree"){
				d.source.sizeRaw = d.source.degrees;
				d.target.sizeRaw = d.target.degrees;
			}
		});
		
		let maxSizeProperty = d3.max(nodes,d=>d.sizeRaw);
		let minSizeProperty = d3.min(nodes,d=>d.sizeRaw);
		nodes.forEach(d => {
			
			let s = (d.sizeRaw-minSizeProperty)/(maxSizeProperty-minSizeProperty);
			s = Math.pow(s,sizePowerCoeff);
			d.sizeFactor = s;
			d.size = (1-s)*minNodeSize+s*maxNodeSize;
		});

		let maxWeight = d3.max(links,d=>d.weight);
		let minWeight= d3.min(links,d=>d.weight);

		links.forEach(d => {
			d.color = gradient(d.source.color, d.target.color);
			let s = (d.weight-minWeight)/(maxWeight-minWeight);
			s = Math.pow(s,widthPowerCoeff);
			d.widthFactor = s;
			d.width = (1-s)*minWidthSize+s*maxWidthSize;
			let minimumSize = Math.min(d.target.size,d.source.size);
			if(minimumSize<d.width){
				d.width=minimumSize;
			}
		});

		// Apply the general update pattern to the nodes.
		nodesView = nodesView.data(nodes, function (d) { return d.id; });
		nodesView.exit().remove();
		nodesView = nodesView.enter().append("circle")
			.merge(nodesView)
			.style('opacity', 1)
			.attr("stroke", d => d3.rgb(d.color).darker(0.5))
			.attr("stroke-width", 1.5)
			.attr("fill", d => d.color)
			.attr("r", d => d.size)
			.on("mouseover", function(d){
				hoverNode=d;

				d3.select(this).attr("r",d.size*1.25)
				.attr("stroke", d3.rgb(d.color).darker(1))
				.attr("stroke-width", 3);
				hoverText.attr("fill", d.color)
				displayProperties.forEach((displayProperty,i)=>{
				// .text(`${displayProperty=="name"?d.name:d[displayProperty]}\n${d[displayProperty]}`);

				hoverText.append("tspan")
				.attr("dy","1.2em")
				.attr("x","0")
				.style("font-size",i==0?"15px":"13px")
					.text(`${displayProperty=="name"?d.name:d[displayProperty]}`);
				});
				updateSelectedNodes();
				d3.event.stopPropagation();
			})
			.on("mouseout", function(d){
				d3.select(this).attr("r",d=>d.size)
				.attr("stroke", d => d3.rgb(d.color).darker(0.5))
				.attr("stroke-width", 1.0);
				hoverText.text(null).select("tspan").remove();
				hoverNode=null;
				updateSelectedNodes();
				d3.event.stopPropagation();
			})
			.on("click", function(d){
				if(!d3.event.shiftKey){
					selectedNodes.clear();
				}
				if(selectedNodes.has(d.id)){
					console.log("unselecting "+d.id);
					selectedNodes.delete(d.id);
				}else{
					console.log("selecting "+d.id);
					selectedNodes.add(d.id);
				}
				updateSelectedNodes();
				d3.event.stopPropagation();
			})
			d3.select("#networkView").on("click",d=>{
				if(!d3.event.shiftKey){
					selectedNodes.clear();
					updateSelectedNodes();
				}
			});


		if (renderLinksSVG) {
			createSVGLinks();
		}

		if (renderLinksGL) {
			updateGLNodesAndEdges();
			updateEdgesGLGeometry();
			updateNodesGLColors();
		}
		// Update and restart the simulation.
		simulation.nodes(nodes);
		simulation.force("link").links(links);
		simulation
			.alpha(0.6)
			.restart();

		updateLegend();
		updateSelectedNodes();
	}

	function createSVGLinks() {
		linksView = linksView.data(links, d => d.source.id + "-" + d.target.id);
		linksView.exit().remove();

		if (renderGradientLinks) {
			let linkNew = linksView.enter().append("g");

			linkNew.append("line")
				.attr("stroke", d => d.color)
				.attr("stroke-width", "5px")
				.attr("opacity", 1.0)
				.attr("x1", 0)
				.attr("y1", 0)
				.attr("x2", 1.0 / Math.sqrt(2))
				.attr("y2", 1.0 / Math.sqrt(2))//Hack
				.attr("vector-effect","non-scaling-stroke");

			linksView = linkNew.merge(linksView);
		} else {
			let linkNew = linksView.enter().append("line")
				.attr("opacity", 0.1);
			linksView = linkNew.merge(linksView);
		}
	}


	function updateSelectedNodes(justUpdate=false) {
		let verticalOffset = -10;
		if(!justUpdate){
			// console.log("updating...");
			// console.log(Array.from(selectedNodes).map(d=>nodeByID[d]))
			let selectedNodesArray = Array.from(selectedNodes).map(d=>nodeByID[d]).filter(d=>d)
			
			if(hoverNode && !selectedNodes.has(hoverNode.id)){
				selectedNodesArray.push(hoverNode);
			}
			selectedView = selectedView.data(selectedNodesArray);
			selectedView.exit().remove();
			let selectedViewNew = selectedView.enter()
					.append("g")
					.classed("nodesSelected",true)
					.classed("nointeraction",true);

			selectedViewNew.append("path").attr("d",
				`M ${-verticalOffset*1},${verticalOffset+3} L ${0},${0} L ${+verticalOffset*1},${verticalOffset+3} z`)
			let textView = selectedViewNew.append("g")
				.attr("transform", (d, i) => ("translate("+0+","+verticalOffset+")"))
				.classed("textbox",true);
			textView.append("text").classed("outline",true);
			textView.append("text").classed("name",true);
			selectedView = selectedViewNew.merge(selectedView);
			
		}
		selectedView
				.attr("transform", (d, i) => ("translate("+xscale(d.x)+","+yscale(d.y)+")"));

		selectedView.select(".name")
			.attr("fill", d => d3.rgb(d.color).darker(1))
			.attr("font-size","19px")
			.attr("text-anchor","middle")
			.text(d => `${displayProperties[0]=="name"?d.name:d[displayProperties[0]]}`);

		selectedView.select(".outline")
		.attr("fill", "white")
		.attr("stroke", "white")
		.attr("stroke-width", 6)
		.attr("font-size","19px")
		.attr("text-anchor","middle")
		.style('opacity', 0.9)
		.text(d => `${displayProperties[0]=="name"?d.name:d[displayProperties[0]]}`);

		selectedView.select("path")
			.attr("fill", d => d3.rgb(d.color).darker(1))
			.attr("stroke", "white")
			.style('opacity', 0.9)
			.attr("stroke-width", 2)

	}

	function deleteSVGLinks() {
		linksView = linksView.data([]);
		linksView.exit().remove();
	}
	
	function updateSVGLinks(strokeFactor = 2.0) {
		if (renderGradientLinks) {
			linksView.attr("transform", d => {
				return getTransformForLine(
					xscale(d.source.x),
					yscale(d.source.y),
					xscale(d.target.x),
					yscale(d.target.y),
				);
			}).attr("stroke-width", d => {
				return strokeFactor / getStrokeCorrectionForLine(
					xscale(d.source.x),
					yscale(d.source.y),
					xscale(d.target.x),
					yscale(d.target.y),
				);
			});
		} else {
			linksView
				.attr("x1", d => xscale(d.source.x))
				.attr("y1", d => yscale(d.source.y))
				.attr("x2", d => xscale(d.target.x))
				.attr("y2", d => yscale(d.target.y));
		}
	}

	function updateLegend() {
		return;
		let legendItems = legendView.selectAll(".legend").data(Object.keys(partiesToColors));
		legendItems.exit().remove();


		let legendEnter = legendItems.enter().append("g")
			.classed("legend", true)
			.attr("transform", (d, i) => ("translate(0," + (i * 20) + ")"));

		legendEnter.append("rect");
		legendEnter.append("g").append("text");
		legendItems = legendItems.merge(legendEnter)

		legendItems.select("rect")
			.attr("x", 0)
			.attr("y", 0)
			.attr("width", 30)
			.attr("height", 15)
			.attr("fill", d => partiesToColors[d]);

		legendItems.select("g")
			.attr("transform", (d) => (`translate(${35},${15 / 2})`))
			.select("text")
			.text(d => partiesNames[d])
			.style("alignment-baseline", "central");

	}

	function updateGLNodesAndEdges() {
		positionArray = new Float32Array(nodes.length * 2);//2D
		colorArray = new Float32Array(nodes.length * 3);
		edgesIndices = new Uint16Array(links.length * 2);
		// console.log("Update Nodes and Edges Arrays Done!");
	}

	function updateNodesGLGeometry() {
		nodes.forEach((node, index) => {
			positionArray[index * 2] = (node.x ? ((xscale(node.x)) / width * 2 - 1) : 0.0);
			positionArray[index * 2 + 1] = (node.y ? (-(yscale(node.y)) / height * 2 + 1) : 0.0);
		});
		// for (let index = 0; index < nodes.length; index+=2) {
		// 	positionArray[index*2] = 0;
		// 	positionArray[index*2+1] = 0;
		// 	positionArray[index*2+2] = index/1000;
		// 	positionArray[index*2+3] = index*index/100000;
		// }

		gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positionArray, gl.DYNAMIC_DRAW);
		// console.log(positionArray);
		// console.log(`Update Nodes Done! (${positionArray.length})` );
	}

	function updateEdgesGLGeometry() {
		links.forEach((edge, index) => {
			edgesIndices[index * 2] = edge.source.index;
			edgesIndices[index * 2 + 1] = edge.target.index;
		});


		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgesBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edgesIndices, gl.DYNAMIC_DRAW);
		// console.log(`Update Edges Done! (${edgesIndices.length})` );
	}

	function updateNodesGLColors() {

		nodes.forEach((node, index) => {
			let color = d3.rgb(node.color);
			colorArray[index * 3] = color.r / 255.0;
			colorArray[index * 3 + 1] = color.g / 255.0;
			colorArray[index * 3 + 2] = color.b / 255.0;
		});

		gl.bindBuffer(gl.ARRAY_BUFFER, colorsBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, colorArray, gl.DYNAMIC_DRAW);
		// console.log(`Update Colors Done! (${colorArray.length})` );
	}

	function redrawEdgesGL() {

		dpr = window.devicePixelRatio || 1;
		needsUpdate = false;
		// gl.depthMask(false);
		if (useDarkBackground) {
			gl.clearColor(0.0, 0.0, 0.0, 1.0);
		} else {
			gl.clearColor(1.0, 1.0, 1.0, 1.0);
		}

		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.lineWidth(linesWidth*dpr);
		gl.enable(gl.BLEND);
		if (useDarkBackground) {
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
		} else {
			//gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
				gl.ZERO, gl.ONE);
		}

		updateNodesGLGeometry();

		edgesShaderProgram.use(gl);

		edgesShaderProgram.attributes.enable("vertex");
		edgesShaderProgram.attributes.enable("color");

		gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
		gl.vertexAttribPointer(edgesShaderProgram.attributes.vertex, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, colorsBuffer);
		gl.vertexAttribPointer(edgesShaderProgram.attributes.color, 3, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgesBuffer);

		//gl.uniform2fv(edgesShaderProgram.uniforms.nearFar,[0.1,10.0]);

		let maxLineIntensity = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)[1];
		let currentLineIntensity = linesIntensity;
		if(maxLineIntensity==1 && linesIntensity<0.5){
			currentLineIntensity*=2*dpr;
		}
		gl.uniform1f(edgesShaderProgram.uniforms.linesIntensity, currentLineIntensity);

		//drawElements is called only 1 time. no overhead from javascript
		gl.drawElements(gl.LINES, edgesIndices.length, indexType, 0);

		//disabling attributes
		edgesShaderProgram.attributes.disable("vertex");
		edgesShaderProgram.attributes.disable("color");

	}



	function redraw() {
		let svgNode = svg.node();
		let canvasNode = canvas.node();
		width = svgNode.clientWidth;
		height = svgNode.clientHeight;
		

		dpr = window.devicePixelRatio || 1;

		var rect = canvasNode.getBoundingClientRect();

		canvasNode.width = width * dpr;
		canvasNode.height = height * dpr;


		hoverTextBox
			.attr("transform", `translate(${width-20},30)`);

		let xextent = d3.extent(nodes, d => d.x);
		let yextent = d3.extent(nodes, d => d.y);

		let xcenter = d3.mean(nodes, d => d.x);
		let ycenter = d3.mean(nodes, d => d.y);

		let dataWidth = 2 * d3.max([xcenter - xextent[0], xextent[1] - xcenter]);
		let dataHeight = 2 * d3.max([ycenter - yextent[0], yextent[1] - ycenter]);


		let panelAspectRatio = width / height;
		let dataAspectRatio = dataWidth / dataHeight;

		if (dataWidth > 0 && dataHeight > 0) {
			if (dataAspectRatio > panelAspectRatio) {
				targetScaleFactor = width / dataWidth;
			} else {
				targetScaleFactor = height / dataHeight;
			}
		}


		let gamma = 0.05
		if (scaleFactor > 0) {
			scaleFactor = scaleFactor * (1 - gamma) + targetScaleFactor * gamma;
		} else {
			scaleFactor = targetScaleFactor;
		}

		
		xscale
			.range([width / 2 - dataWidth / 2 * scaleFactor * zoomScale, width / 2 + dataWidth / 2 * scaleFactor * zoomScale])
			.domain([xcenter - dataWidth / 2, xcenter + dataWidth / 2]);

		yscale
			.range([height / 2 - dataHeight / 2 * scaleFactor * zoomScale, height / 2 + dataHeight / 2 * scaleFactor * zoomScale])
			.domain([ycenter - dataHeight / 2, ycenter + dataHeight / 2]);

		// xscale = xscale.domain());
		// yscale = yscale.domain(d3.extent(nodes,d=>d.y));
		nodesView
			.attr("cx", d => xscale(d.x))
			.attr("cy", d => yscale(d.y))


		if (renderLinksGL) {
			if (edgesIndices && colorArray && edgesIndices) {
				gl.viewport(0, 0, canvasNode.width, canvasNode.height);
				redrawEdgesGL();
			}
		}

		if (renderLinksCanvas) {
			needsUpdate = false;
			let ctx = canvasNode.getContext('2d');
			ctx.fillStyle = '#fff'
			ctx.clearRect(0, 0, canvasNode.width, canvasNode.height);
			ctx.scale(dpr, dpr);
			links.forEach(d => {
				ctx.lineWidth = d.width * dpr;
				let colorStart = d.source.color;
				let colorEnd = d.target.color;

				let x1 = xscale(d.source.x);
				let y1 = yscale(d.source.y);

				let x2 = xscale(d.target.x);
				let y2 = yscale(d.target.y);

				ctx.globalAlpha = d.widthFactor*(maxLineOpacity-minLineOpacity)+minLineOpacity;
				if (renderGradientLinks) {
					let grad = ctx.createLinearGradient(x1, y1, x2, y2);
					grad.addColorStop(0.0, colorStart);
					grad.addColorStop(1.0, colorEnd);
					ctx.strokeStyle = grad;
				} else {
					ctx.strokeStyle = colorStart;
				}
				ctx.beginPath();
				ctx.moveTo(x1, y1);
				ctx.lineTo(x2, y2);
				ctx.stroke();
			});
		}

		if (renderLinksSVG) {
			updateSVGLinks();
		}
		updateSelectedNodes(true);
		if(Math.abs(scaleFactor-targetScaleFactor)>0.005){
			needsUpdate=true;
		}
	}


	//Loading Networks
	let networks = [];
	let timeIndices = [];
	let timelines = extraDataset["timelines"];
	
	let thresholds = [50,60,70,80,90]
	displayProperties = ["Label"];
	IDProperty = "Label";
	colorProperty = "Louvain Layered";

	for (let thresholdIndex = 0; thresholdIndex < thresholds.length; thresholdIndex++) {
		let threshold=thresholds[thresholdIndex];
		let network = null;
		// try {
			let filename = `net_Control_vs_EKB_081922_Aggregated_T0.${threshold}_pos-major`;
			network = await readNetworkFile("Data/" + filename + ".xnet");
			// network = xnet.load(JUPYTER_DATA["networks"][year]);
			network.name = filename;
		// } catch (error) {
		// 	console.log(threshold);
		// 	console.log(error);
		// }
		networks.push(network);
		timeIndices.push([0, threshold]);
	}


	setDrawNetwork(networks[startIndex],startIndex);
	window.setNetwork = (i) => {
		let network = networks[i];
		if (network) {
			setDrawNetwork(network,i);
			restart();
		}
	}


	d3.select("#timeSlider")
		.property("max", timeIndices.length - 1)
		.property("value", startIndex)
		.on("input", function input() {
			window.setNetwork(+this.value);
		});
	// oioi();

	restart();
	redraw();
	redrawRuler();
	window.addEventListener("resize", () => {
		myRequestAnimationFrame(() => {
			needsUpdate = false;
			redrawRuler();
			redraw();
		});
	});

	function redrawRuler() {
		let timeRulerSVG = d3.select("#timeRule");
		let ruleWidth = timeRulerSVG.node().clientWidth;
		let ruleHeight = timeRulerSVG.node().clientHeight;
		let ruleScale = d3.scaleLinear()
			.range([5, ruleWidth - 5])
			.domain([0, thresholds.length-1]);
		timeRulerSVG.selectAll("*").remove();
		timeRulerSVG.append("g")
			.attr("class", "axis")
			.attr("transform", "translate(0," + "20" + ")")
			.call(d3.axisTop(ruleScale)
				.ticks(thresholds.length-1)
				.tickFormat(d3.timeFormat("")));

		timeRulerSVG.append("g")
			.attr("class", "axis")
			.attr("transform", "translate(0," + "20" + ")")
			.call(d3.axisTop(ruleScale)
				.ticks(thresholds.length-1)
				.tickFormat(d=>{return "T="+(thresholds[d]/100);}));
		// .selectAll("text")	
		//   .style("text-anchor", "end")
		//   .attr("dx", "-.8em")
		//   .attr("dy", ".15em")
		//   .attr("transform", "rotate(-65)");

	}

	function zoomAnimation() {
		if(needsUpdate){
			redraw();
		}
		myRequestAnimationFrame(zoomAnimation);
	}


	myRequestAnimationFrame(zoomAnimation);







	function plotBottomGraphics(){
		extraDataset["plots"].forEach(plotData => {
			let name = plotData.name;
			let order = plotData.order;
			let data = plotData.data;
			console.log(data);
			let margin = {top: 25, right: 20, bottom: 35, left: 50};
			let panelSize = [400,100];
			let width = panelSize[0] - margin.left - margin.right;
			let height = panelSize[1] - margin.top - margin.bottom;

			let Xkey = order[0];
			let Ykeys = order.slice(1);
			let color = d3.scaleOrdinal().range(["#aa6666","#666666"]);
			let lineType = d3.scaleOrdinal().range(["5,5",null]);

			let svg = d3.select("#plotsPanel")
				.append("svg")
				.attr("width",panelSize[0])
				.attr("height",panelSize[1])
				.classed("linePlot",true);

			let g = svg
				.append("g")
				.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

			let xRange = d3.scaleLinear()
							.rangeRound([0, width]);

			let yRange = d3.scaleLinear()
					.range([height, 0]);

			let lines = Ykeys.map(Ykey => {
				return d3.line()
					.x(d => xRange(d[Xkey]))
					.y(d => yRange(d[Ykey]));
					// .curve(d3.curveMonotoneX);
				});
				console.log(lines);
			
			let allY = [];
			data.forEach(d => {
				Ykeys.forEach(Ykey => {
					allY.push(d[Ykey]);
				});
			});

			xRange = xRange.domain(d3.extent(data, d=>+d[Xkey])).nice();
			yRange = yRange.domain(d3.extent(allY)).nice();

			g.append("g")
						.attr("class", "axis")
						.attr("transform", "translate(0," + height + ")")
						.call(d3.axisBottom(xRange).tickFormat(d3.format("d")))
						.style("text-anchor", "middle")
						.attr("dx", "-.1em")
						.attr("font-size", "10px");

			g.append("g")
					.attr("class", "axis")
					.call(d3.axisLeft(yRange).ticks(3));
			
			g.append("text")
					.attr("x",width/2)
					.attr("y", -8)
					// .attr("dy", "0.71em")
					.attr("fill", "#000")
					.attr("text-anchor", "middle")
					.text(name);
			
					Ykeys.forEach((Ykey,i) => {
						let curve = g.append("g")
						// curve.selectAll(".curve").data(data)
						// .enter()
						curve.append("path")
						.style("fill", "none")
						.attr("class", "line")
						.attr("d", d=>lines[i](data))
						.style("stroke", color(Ykey))
						.style("stroke-width", 2)
						.style("stroke-dasharray",lineType(Ykey));
						
						let lastPoints = data[Math.max(0,data.length-2)];
						console.log(lastPoints);
						curve.append("text")
						.attr("fill", color(Ykey))
						.attr("x", xRange(lastPoints[Xkey])-3)
						.attr("y", yRange(lastPoints[Ykey])-3)
						// .attr("dy", "0.35em")
						.style("font-size", "13px")
						.text(Ykey);
					});
				// let curves = g.selectAll(".curve")
				// 		.data(Ykeys)
				// 		.enter()
				// 		.append("g")
				// 		.attr("class", "curve");

				// 	curves.append("path")
				// 		.style("fill", "none")
				// 		.attr("class", "line")
				// 		.attr("d", (d,i)=> )
				// 		.style("stroke", function(d) { return color(d.id); });
				
	// 	browser.append("text")
	// 			.datum(function(d) { return {id: d.id, value: d.values[0]}; })
	// 			.attr("transform", function(d) { return "translate(" + xRange(d.value.Date) + "," + yRange(d.value.market_share) + ")"; })
	// 			.attr("x", 3)
	// 			.attr("dy", "0.35em")
	// 			.style("font", "10px sans-serif")
	// 			.text(function(d) { return d.id; });

	// });
		});
	}
	// plotBottomGraphics();

}

function collapsePlots(){
	if(d3.select("#collapsablePanel").classed("collapsed")){
		d3.select("#collapsablePanel").classed("collapsed",false);
	}else{
		d3.select("#collapsablePanel").classed("collapsed",true);
	}
}

d3.select("#showHideButton").on("click", d=>{
	collapsePlots();
});


startVisualization();