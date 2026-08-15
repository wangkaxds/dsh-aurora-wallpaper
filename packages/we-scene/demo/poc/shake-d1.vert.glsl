#version 300 es

// [COMBO] {"material":"ui_editor_properties_audio_response","combo":"AUDIOPROCESSING","type":"audioprocessingoptions","default":0}

uniform mat4 g_ModelViewProjectionMatrix;
uniform vec4 g_Texture1Resolution;


in vec3 a_Position;
in vec2 a_TexCoord;

uniform vec2 g_Bounds; // {"material":"bounds","label":"ui_editor_properties_bounds","default":"0 1"}

out vec4 v_TexCoord;
out vec2 v_Bounds;


void main() {
	gl_Position = transpose(g_ModelViewProjectionMatrix) * vec4(a_Position, 1.0);
	v_TexCoord.xy = a_TexCoord;
	v_TexCoord.zw = vec2(v_TexCoord.x * g_Texture1Resolution.z / g_Texture1Resolution.x,
						v_TexCoord.y * g_Texture1Resolution.w / g_Texture1Resolution.y);
	v_Bounds.x = g_Bounds.x;
	v_Bounds.y = 1.0 / (g_Bounds.y - g_Bounds.x);


}
