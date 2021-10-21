"use strict";

let gl, canvas;
let pwgl = {};
pwgl.ongoingImageLoads = []; // 현재 로딩중인 이미지 객체들을 담아놓을 배열

function createGLContext(canvas) {
  const names = ["webgl", "experimental-webgl"];
  let context = null;

  for (let i = 0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch (error) {}

    if (context) {
      break;
    }
  }

  if (context) {
    // 예제 원문에서 사용하는 코드는 안티패턴이므로 작성하지 않도록 함.
  } else {
    alert("Failed to create WebGL context!");
  }

  return context;
}

function loadShaderFromDOM(id) {
  const shaderScript = document.getElementById(id);

  if (!shaderScript) {
    return null;
  }

  let shaderSource = "";
  let currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeType === 3) {
      shaderSource += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }

  let shader;
  if (shaderScript.type === "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type === "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }

  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);

  if (
    !gl.getShaderParameter(shader, gl.COMPILE_STATUS) &&
    !gl.isContextLost()
  ) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;
}

function setupShaders() {
  const vertexShader = loadShaderFromDOM("shader-vs");
  const fragmentShader = loadShaderFromDOM("shader-fs");

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (
    !gl.getProgramParameter(shaderProgram, gl.LINK_STATUS) &&
    !gl.isContextLost()
  ) {
    alert("Failed to setup shaders: " + gl.getProgramInfoLog(shaderProgram));
  }

  gl.useProgram(shaderProgram);

  // gl.getAttribLocation()을 이용해서 셰이더 내의 애트리뷰트 변수들의 제네릭 애트리뷰트 인덱스를 받아온 뒤, 전역 객체인 pwgl에 저장함.
  pwgl.vertexPositionAttributeLoc = gl.getAttribLocation(
    shaderProgram,
    "aVertexPosition"
  );
  pwgl.vertexNormalAttributeLoc = gl.getAttribLocation(
    shaderProgram,
    "aVertexNormal"
  );
  pwgl.vertexTextureAttributeLoc = gl.getAttribLocation(
    shaderProgram,
    "aTextureCoordinates"
  );

  //  gl.getUniformLocation()을 이용해서 셰이더 내의 유니폼 변수들의 WebGLUniformLocation 객체를 받아온 뒤, 전역 객체인 pwgl에 저장함.
  pwgl.uniformMVMatrixLoc = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  pwgl.uniformProjMatrixLoc = gl.getUniformLocation(shaderProgram, "uPMatrix");
  pwgl.uniformNormalMatrixLoc = gl.getUniformLocation(
    shaderProgram,
    "uNMatrix"
  );
  pwgl.uniformSamplerLoc = gl.getUniformLocation(shaderProgram, "uSampler");
  pwgl.uniformLightPositionLoc = gl.getUniformLocation(
    shaderProgram,
    "uLightPosition"
  );
  pwgl.uniformAmbientLightColorLoc = gl.getUniformLocation(
    shaderProgram,
    "uAmbientLightColor"
  );
  pwgl.uniformDiffuseLightColorLoc = gl.getUniformLocation(
    shaderProgram,
    "uDiffuseLightColor"
  );
  pwgl.uniformSpecularLightColorLoc = gl.getUniformLocation(
    shaderProgram,
    "uSpecularLightColor"
  );

  // 버텍스 좌표 데이터, 노멀 데이터, 텍스처 좌표 데이터를 쏴줄 각 애트리뷰트 변수들을 활성화함.
  // 왜냐면, 얘내들은 상수 버텍스 데이터가 아니라 WebGLBuffer에 기록된 데이터 배열로 쏴줄거니까
  gl.enableVertexAttribArray(pwgl.vertexPositionAttributeLoc);
  gl.enableVertexAttribArray(pwgl.vertexNormalAttributeLoc);
  gl.enableVertexAttribArray(pwgl.vertexTextureAttributeLoc);

  // 모델뷰행렬, 투영행렬을 위한 4*4 빈 행렬 및 모델뷰행렬 스택을 만들어 둠
  pwgl.modelViewMatrix = mat4.create();
  pwgl.projectionMatrix = mat4.create();
  pwgl.modelViewMatrixStack = [];
}

function setupFloorBuffers() {
  // gl.drawElements()로 바닥을 그릴 때 사용할 버텍스 위치 데이터 WebGLBuffer 생성
  pwgl.floorVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.floorVertexPositionBuffer); // 어떤 WebGLBuffer에 gl.bufferData()로 기록할건지 바인딩함.

  const floorVertexPosition = [
    // y좌표값(높이)가 0인 4개의 버텍스 좌표를 기록해 둠.
    5.0,
    0.0,
    5.0, //v0
    5.0,
    0.0,
    -5.0, //v1
    -5.0,
    0.0,
    -5.0, //v2
    -5.0,
    0.0,
    5.0, // v3
  ]; // 버텍스 셰이더에서 투영 변환하여 클립좌표(-1.0 ~ 1.0)로 변환해 줌. 굳이 버텍스 데이터를 클립좌표로 안넣어도 됨.

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(floorVertexPosition),
    gl.STATIC_DRAW
  );

  pwgl.FLOOR_VERTEX_POS_BUF_ITEM_SIZE = 3; // 버텍스 하나 당 필요한 좌표값 수
  pwgl.FLOOR_VERTEX_POS_BUF_NUM_ITEMS = 4; // 총 버텍스 수

  // 바닥을 그릴 때, 버텍스 셰이더에서 밝기값 계산 시 필요한 노멀 데이터를 저장해 둘 WebGLBuffer 생성
  pwgl.floorVertexNormalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.floorVertexNormalBuffer);

  const floorVertexNormals = [
    0.0,
    1.0,
    0.0, // v0
    0.0,
    1.0,
    0.0, // v1
    0.0,
    1.0,
    0.0, // v2
    0.0,
    1.0,
    0.0, // v3
  ]; // 바닥면은 양의 y축에 수직이고, 양의 y축으로 향하고 있으므로, 바닥면의 모든 버텍스는 (0.0, 1.0, 0.0)을 노말 벡터로 가짐.

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(floorVertexNormals),
    gl.STATIC_DRAW
  );

  pwgl.FLOOR_VERTEX_NORMAL_BUF_ITEM_SIZE = 3; // 버텍스 하나 당 필요한 노멀 데이터 수
  pwgl.FLOOR_VERTEX_NORMAL_BUF_NUM_ITEMS = 4; // 총 버텍스 수

  // 바닥을 그릴 때 각 버텍스마다 사용할 텍스처 좌표값을 저장해 둘 WebGLBuffer 생성
  pwgl.floorVertexTextureCoordinateBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.floorVertexTextureCoordinateBuffer);

  const floorVertexTextureCoordinates = [
    2.0,
    0.0, // v0
    2.0,
    2.0, // v1
    0.0,
    2.0, // v2
    0.0,
    0.0, // v3
  ]; // 각 버텍스에 할당될 텍스처 좌표가 (0.0, 0.0) ~ (1.0, 1.0) 범위를 벗어남. -> 텍스처 래핑으로 처리되겠군

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(floorVertexTextureCoordinates),
    gl.STATIC_DRAW
  );

  pwgl.FLOOR_VERTEX_TEX_COORD_BUF_ITEM_SIZE = 2; // 버텍스 하나 당 필요한 텍스처 좌표값 수
  pwgl.FLOOR_VERTEX_TEX_COORD_BUF_NUM_ITEMS = 4; // 총 버텍스 수

  // gl.drawElements()로 바닥을 그릴 때 사용할 버텍스 인덱스를 기록할 WebGLBuffer 생성
  pwgl.floorVertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pwgl.floorVertexIndexBuffer);

  const floorVertexIndices = [0, 1, 2, 3];

  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(floorVertexIndices),
    gl.STATIC_DRAW
  );

  pwgl.FLOOR_VERTEX_INDEX_BUF_ITEM_SIZE = 1; // 버텍스 하나를 가리키는 인덱스 수. 딱히 예제에서 사용 안함.
  pwgl.FLOOR_VERTEX_INDEX_BUF_NUM_ITEMS = 4; // 총 (버텍스를 가리키는)인덱스 수
}

function setupBuffers() {
  setupFloorBuffers();
}

// 로딩이 끝난 이미지 객체와 텍스처 객체를 전달받은 뒤, 텍스처 바인딩 및 텍스처 데이터 전송 등 텍스처 사용에 필요한 나머지 작업들을 해주는 함수
function textureFinishedLoading(image, texture) {
  // gl.bindBuffer()와 마찬가지로, 'WebGL 에게 지금부터 이 텍스처 객체를 사용할 겁니다' 라고 지정함.
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // 텍스처 데이터(이미지 객체)를 GPU로 전송하기 전, 이미지를 Y축 방향으로 뒤집어 줌.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  // 바인딩된 WebGLTexture 객체에 대하여 해당하는 이미지 객체를 GPU로 전송함.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // 축소 필터에서 밉맵 체인이 필요한 텍스처 필터링 방법 사용 시 밉맵 체인을 자동생성 해둬야 함. 근데 여기서는 밉맵이 필요한 필터링을 딱히 안쓰고 있긴 함.
  gl.generateMipmap(gl.TEXTURE_2D);

  // 텍스처 필터링 방법 지정
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // 텍스처 확대 시 필터링 방법 지정
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // 텍스처 축소 시 필터링 방법 지정

  // 텍스처 래핑 방법 지정 -> 이 예제에서는 floor에 사용될 텍스처가 래핑될거임. (애트리뷰트 변수에 쏴주는 텍스처 좌표 데이터를 보면 알 수 있음.)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT); // 가로 방향 래핑 모드 지정
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT); // 세로 방향 래핑 모드 지정

  // 3개의 WebGLTexture 객체를 반복해서 처리해줘야 하므로, 다음 텍스처 객체 바인딩 전,
  // 마지막 줄에서 null을 바인딩해 초기화함.
  gl.bindTexture(gl.TEXTURE_2D, null);
}

// WebGLTexture 객체 사용 시 GPU에 전송할 Image 객체를 만들어주는 함수
function loadImageForTexture(url, texture) {
  const image = new Image();
  image.onload = function () {
    pwgl.ongoingImageLoads.splice(pwgl.ongoingImageLoads.indexOf(image), 1); // 로딩을 무사히 마친 이미지객체는 pwgl.ongoingImageLoads 배열에서 splice로 제거함. -> 더 이상 tracking을 해줄 필요가 없는 이미지 객체니까!
    textureFinishedLoading(image, texture); // 텍스처 바인딩, 데이터 전송 등 텍스처 사용에 필요한 나머지 작업을 처리하는 함수 호출
  };
  pwgl.ongoingImageLoads.push(image); // 이미지 로딩 전, 로딩이 진행중인 이미지객체를 모아두는 배열에 담아놓음.
  image.src = url; // 전달받은 url을 할당하여 이미지를 비동기로 로드하기 시작함.
}

// 텍스처 객체(WebGLTexture)들을 생성하는 함수
function setupTextures() {
  // 바닥 텍스처 객체
  pwgl.groundTexture = gl.createTexture();
  loadImageForTexture("wood_floor_256.jpg", pwgl.groundTexture);
}

// 빛에 관한 정보를 프래그먼트 셰이더의 각 유니폼 변수로 업로드해주는 함수
function setupLights() {
  // gl.uniform3fv(WebGLUniformLocation, 빛 정보 배열)로 프래그먼트 셰이더에 각각의 유니폼 변수에 두 번째 인자를 업로드해줌.
  gl.uniform3fv(pwgl.uniformLightPositionLoc, [0.0, 10.0, -10.0]); // 빛(광원)의 위치 데이터
  gl.uniform3fv(pwgl.uniformAmbientLightColorLoc, [0.3, 0.3, 0.3]); // 앰비언트 광원 성분 * 앰비언트 재질 특성을 사전에 곱한 값
  gl.uniform3fv(pwgl.uniformDiffuseLightColorLoc, [0.9, 0.9, 0.9]); // 디퓨즈 광원 성분 * 디퓨즈 재질 특성을 사전에 곱한 값
  gl.uniform3fv(pwgl.uniformSpecularLightColorLoc, [0.0, 0.0, 0.0]); // 스펙큘러 광원 성분 * 스펙큘러 재질 특성을 사전에 곱한 값

  /**
   * 주의!
   *
   * 이 예제에서는 '퐁 셰이딩'을 사용하고 있으므로,
   * 조명 계산이 프래그먼트 셰이더에서 처리되고 있음.
   *
   * 따라서 조명 계산에 필요한 변수들이
   * (uLightPosition, uAmbientLightColor, ... 등)
   * 프래그먼트 셰이더에 위치하고 있는 상태이므로,
   *
   * setupLights 함수에서는 각각의 데이터들을
   * 프래그먼트 셰이더 내의 유니폼 변수들로 쏴주는 것이 되겠지!
   */
}

function uploadModelViewMatrixToShader() {
  // gl.uniformMatrix4fv() 메서드로 버텍스 셰이더의 uMVMatrix 유니폼 변수에
  // 초기화 또는 수정된 modelViewMatrix를 업로드함.
  gl.uniformMatrix4fv(pwgl.uniformMVMatrixLoc, false, pwgl.modelViewMatrix);

  /**
   * 참고로 두 번째 인자인 false는 전송하려는 행렬의 전치여부
   * -> glMatrix 라이브러리로 계산하는 모든 행렬은
   * 열 우선 행렬로 결과값을 리턴해주므로, 행렬을 번복해서 전치해줄 필요가 없으니 false로 전달할 것!
   */
}

function uploadProjectionMatrixToShader() {
  // gl.uniformMatrix4fv() 메서드로 버텍스 셰이더의 uPMatrix 유니폼 변수에
  // 초기화된 projectionMatrix를 업로드함.
  gl.uniformMatrix4fv(pwgl.uniformProjMatrixLoc, false, pwgl.projectionMatrix);
}

// 버텍스의 노멀 데이터를 눈 좌표계로 변환하기 위해 필요한 특별한 행렬(모델뷰행렬의 상단 3*3 역전치 행렬)을
// 초기 모델뷰행렬로 만들어서 버텍스 셰이더에 쏴주는 함수
function uploadNormalMatrixToShader() {
  const normalMatrix = mat3.create(); // 역전치 행렬을 만들어 줄 비어있는 3*3 행렬 생성
  mat4.toInverseMat3(pwgl.modelViewMatrix, normalMatrix); // 모델뷰행렬의 상단 3*3 행렬의 역행렬로 변환하여 결과값을 normalMatrix에 할당해 줌.
  mat3.transpose(normalMatrix); // 모델뷰행렬의 상단 3*3 역행렬(normalMatrix)을 전치시켜서 3*3 역전치 행렬로 만들어 줌.

  // 모델뷰행렬의 상단 3*3 역전치 행렬을 다 만들었으면, 버텍스 셰이더의 uNMatrix 유니폼 변수에 업로드함.
  gl.uniformMatrix3fv(pwgl.uniformNormalMatrixLoc, false, normalMatrix); // 이때, 4*4 아니고, 3*3 행렬을 전송하는 거니까 gl.uniformMatrix3fv() 메서드를 사용해야 함.
}

// 바닥을 그리는 함수
function drawFloor() {
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.floorVertexPositionBuffer); // WebGLBuffer 위치 버퍼 바인딩
  gl.vertexAttribPointer(
    pwgl.vertexPositionAttributeLoc,
    pwgl.FLOOR_VERTEX_POS_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  ); // pwgl.floorVertexPositionBuffer에 기록된 버텍스 데이터를 aVertexPosition으로 가져올 방법을 정의함.

  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.floorVertexNormalBuffer); // WebGLBuffer 노멀 버퍼 바인딩
  gl.vertexAttribPointer(
    pwgl.vertexNormalAttributeLoc,
    pwgl.FLOOR_VERTEX_NORMAL_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  ); // pwgl.floorVertexNormalBuffer에 기록된 버텍스 데이터를 aVertexNormal으로 가져올 방법을 정의함.

  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.floorVertexTextureCoordinateBuffer); // WebGLBuffer 텍스처 좌표 버퍼 바인딩
  gl.vertexAttribPointer(
    pwgl.vertexTextureAttributeLoc,
    pwgl.FLOOR_VERTEX_TEX_COORD_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  ); // pwgl.floorVertexTextureCoordinateBuffer에 기록된 버텍스 데이터를 aTextureCoordinates으로 가져올 방법을 정의함.

  gl.activeTexture(gl.TEXTURE0); // draw() 함수에서 지정해 준 텍스처 이미지 유닛을 사용하도록 명령하는 메서드
  gl.bindTexture(gl.TEXTURE_2D, pwgl.groundTexture); // 해당 텍스처 이미지 유닛에 바인딩하려는 WebGLTexture 객체를 전달함.

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pwgl.floorVertexIndexBuffer); // gl.drawElements() 메서드가 엘레먼트 배열 버퍼를 사용하려면, 먼저 해당 WebGLBuffer를 바인딩해줘야 함.
  gl.drawElements(
    gl.TRIANGLE_FAN,
    pwgl.FLOOR_VERTEX_INDEX_BUF_NUM_ITEMS,
    gl.UNSIGNED_SHORT,
    0
  );

  /**
   * 텍스처 이미지 유닛을 사용하는 원리는
   * 5-1 예제 코드의 app.js 파일에 정리해놓았으니 참고할 것!
   */
}

function draw(currentTime) {
  pwgl.requestId = requestAnimFrame(draw); // 다음 애니메이션 호출 예약을 위해 내부에서 반복 호출.

  if (currentTime === undefined) {
    // DOMHighResTimeStamp 값은 최초 호출(첫 프레임) 시, undefined를 전달하므로,
    // currentTime 값이 필요한 계산을 제대로 해주기 위해 0으로 초기화한 것. -> 원문 코드처럼 Data.now()로 시작하면 원하는 애니메아션이 안나올거임.
    currentTime = 0;
  }

  // NDC 좌표계 -> 윈도우 좌표계로 변환하는 단계(뷰포트 변환)에서, NDC 좌표를 얼마만큼의 윈도우 좌표에 대응시킬 것인지 정해줌.
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // 프레임을 새로 그릴 때마다 색상 버퍼와 깊이 버퍼 값 둘 다 초기화해줌.

  // 초기 투영행렬을 만듦
  mat4.perspective(
    60, // fov
    gl.canvas.width / gl.canvas.height, // aspect
    1, // near
    100.0, // far
    pwgl.projectionMatrix // 결과값(투영행렬)을 할당해 줄 목적지 인자
  );

  // 초기 모델뷰행렬을 만듦. (뷰 변환, 즉 카메라 이동만 적용)
  mat4.identity(pwgl.modelViewMatrix);
  mat4.lookAt([0, 5, 10], [0, 0, 0], [0, 1, 0], pwgl.modelViewMatrix);

  // 투영행렬, 모델뷰행렬을 새로 초기화했으니 버텍스 셰이더에 업로드하는 함수를 호출
  uploadModelViewMatrixToShader();
  uploadProjectionMatrixToShader();

  // 버텍스 셰이더에서 노멀 벡터를 눈 좌표계로 변환할 때 사용하는 특별한 행렬을 만들어서 셰이더에 전송하는 함수
  uploadNormalMatrixToShader();

  // 프래그먼트 셰이더의 uSampler 유니폼 변수에 0을 넣음으로써, 사용할 텍스처 이미지 유닛을 gl.TEXTURE0 으로 지정함.
  gl.uniform1i(pwgl.uniformSamplerLoc, 0);

  // 바닥을 그리는 함수 호출
  drawFloor();
}

// 컨텍스트 상실 발생하면 호출할 이벤트핸들러 함수
function handleContextLost(e) {
  e.preventDefault(); // 컨텍스트 상실이 발생 시, 컨텍스트를 복구하지 않는 기본 동작을 막아준 것.
  cancelRequestAnimFrame(pwgl.requestId);

  // 컨텍스트 상실 발생 시 로딩중이었던 이미지 객체들의 onload 이벤트핸들러를 무효화하고, 이미지 객체들을 제거함.
  for (let i = 0; i < pwgl.ongoingImageLoads.length; i++) {
    pwgl.ongoingImageLoads[i].onload = undefined;
  }
  pwgl.ongoingImageLoads = [];
}

// 컨텍스트 복구 시 또는 startup() 함수 내에서
// 웹지엘 설정 및 리소스, 애니메이션 관련 변수들을 초기화해주는 함수. -> 재사용성을 위해 초기화 작업들만 따로 모아서 묶어둔 것!
function init() {
  // 웹지엘 관련 설정 및 리소스 초기화 작업
  setupShaders();
  setupBuffers();
  setupLights();
  setupTextures();
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);

  // 상자 회전 애니메이션에 필요한 변수값 초기화 작업
  pwgl.x = 0.0;
  pwgl.y = 2.7;
  pwgl.z = 0.0;
  pwgl.circleRadius = 4.0;
  pwgl.angle = 0;

  // 프레임 레이트에 따른 움직임 보정 및 FPS 카운터 제작에 필요한 값들 초기화
  pwgl.animationStartTime = undefined;
  pwgl.previousFrameTimeStamp = 0; // 얘는 원문 코드처럼 Date.now()가 아닌, 0부터 시작해야 FPS 카운팅을 제대로 시작할 수 있음.
}

function handleContextRestored(e) {
  init();
  pwgl.requestId = requestAnimFrame(draw, canvas);
}

function startup() {
  canvas = document.getElementById("myGLCanvas");
  canvas = WebGLDebugUtils.makeLostContextSimulatingCanvas(canvas);

  // 컨텍스트 상실 및 복구 관련 이벤트핸들러 등록
  canvas.addEventListener("webglcontextlost", handleContextLost, false);
  canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

  gl = createGLContext(canvas);
  init(); // WebGL 관련 설정 및 리소스들, 애니메이션 관련 초기값들을 초기화해주는 함수

  // 마우스 클릭 시 webglcontextlost 이벤트를 발생시키는 이벤트핸들러. -> 시뮬레이션을 해주고 싶으면 주석 처리를 풀면 됨.
  // window.addEventListener("mousedown", function () {
  //   canvas.loseContext();
  // });

  draw();
}

/**
 * 7-7 예제와 차이점
 *
 * 이 예제에서는 빛의 감쇄 (attenuation)을 프래그먼트 셰이더로 구현하는 예제임.
 * 그런데, 거리에 따라 빛의 세기가 감쇄하는 개념은 '점 광원'에만 존재하는 개념이기 때문에,
 * 7-7 예제에서 스포트 광원을 구현하기 위해 필요했던 코드들은 지워줘도 됨.
 *
 * 따라서, 스포트 광원을 구현할 게 아니라면,
 * 스포트 광원이 방출되는 방향 벡터, 즉 원뿔의 축에 해당하는 벡터를 전달해 줄
 * uSpotDirection 유니폼 변수 자체가 필요없겠지.
 *
 * 1. 따라서 setupShaders() 함수에서
 * uSpotDirection 유니폼 변수의 WebGLUniformLocation 객체를 리턴받아서
 * 전역변수 pwgl에 저장하는 코드는 지워줘도 됨.
 *
 * 2. 또한, setupLights() 함수에서
 * uSpotDirection에 벡터값을 전달해주는 코드도 필요없겠지.
 */
