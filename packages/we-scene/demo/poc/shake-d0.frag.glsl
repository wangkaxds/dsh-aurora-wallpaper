#version 300 es
precision mediump float;
out vec4 fragColor;

// [COMBO] {"material":"ui_editor_properties_noise","combo":"NOISE","type":"options","default":0}
// [COMBO] {"material":"ui_editor_properties_direction","combo":"DIRECTION","type":"options","default":0,"options":{"ui_editor_properties_center":0,"ui_editor_properties_left":1,"ui_editor_properties_right":2}}




vec3 hsv2rgb(vec3 c)
{
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 rgb2hsv(vec3 RGB)
{
	vec4 P = (RGB.g < RGB.b) ? vec4(RGB.bg, -1.0, 2.0/3.0) : vec4(RGB.gb, 0.0, -1.0/3.0);
	vec4 Q = (RGB.r < P.x) ? vec4(P.xyw, RGB.r) : vec4(RGB.r, P.yzx);
	float C = Q.x - min(Q.w, Q.y);
	float H = abs((Q.w - Q.y) / (6.0 * C + 1e-10) + Q.z);

	vec3 HCV = vec3(H, C, Q.x);
	float S = HCV.y / (HCV.z + 1e-10);
	return vec3(HCV.x, S, HCV.z);
}

vec2 rotateVec2(vec2 v, float r)
{
	vec2 cs = vec2(cos(r), sin(r));
	return vec2(v.x * cs.x - v.y * cs.y, v.x * cs.y + v.y * cs.x);
}

float greyscale(vec3 color)
{
	return dot(color, vec3(0.11, 0.59, 0.3));
}


in vec4 v_TexCoord;
in vec2 v_Bounds;

uniform sampler2D g_Texture0; // {"material":"framebuffer","label":"ui_editor_properties_framebuffer","hidden":true}
uniform sampler2D g_Texture1; // {"material":"flow","label":"ui_editor_properties_shake_direction_map","mode":"flowmask","default":"util/noflow"}
uniform sampler2D g_Texture2; // {"material":"phase","label":"ui_editor_properties_time_offset","mode":"opacitymask","default":"util/white"}
uniform sampler2D g_Texture3; // {"material":"mask","label":"ui_editor_properties_opacity","mode":"opacitymask","combo":"MASK","default":"util/white"}
uniform float g_Time;

uniform float g_Speed; // {"material":"speed","label":"ui_editor_properties_speed","default":1,"range":[0.0, 10]}
uniform float g_Amp; // {"material":"strength","label":"ui_editor_properties_strength","default":0.1,"range":[0.01, 0.5]}
uniform vec2 g_Friction; // {"material":"friction","label":"ui_editor_properties_friction","default":"1 1","linked":true,"range":[0.01, 10.0]}



void main() {

	float flowPhase = texture(g_Texture2, v_TexCoord.zw).r * 6.28318530718;
	vec2 flowColors = texture(g_Texture1, v_TexCoord.zw).rg;
	vec2 flowMask = (flowColors.rg - vec2(0.498, 0.498)) * 2.0;
	float offset = 0.0;
	
	float time = g_Speed * g_Time + flowPhase;
	offset = sin(fract(time / 6.28318530718) * 6.28318530718);
	offset = offset * 0.498 + 0.5;
	float base = step(0.0, cos(time));
	offset = mix(1.0 - pow(1.0 - offset, g_Friction.x), pow(offset, g_Friction.y), base);
	offset = clamp((offset - v_Bounds.x) * v_Bounds.y, 0.0, 1.0);


	offset = offset * 2.0 - 1.0;


	
	vec2 texCoordOffset = offset * g_Amp * g_Amp * flowMask;
	fragColor = texture(g_Texture0, texCoordOffset + v_TexCoord.xy);
	
}
