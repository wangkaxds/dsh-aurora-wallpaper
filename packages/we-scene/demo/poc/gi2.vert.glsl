#version 300 es

// [COMBO] {"material":"ui_editor_properties_lighting","combo":"LIGHTING","default":0}
// [COMBO] {"material":"ui_editor_properties_reflection","combo":"REFLECTION","default":0}

mat3 BuildTangentSpace(const vec3 normal, const vec4 signedTangent)
{
	vec3 tangent = signedTangent.xyz;
	vec3 bitangent = cross(normal, tangent) * signedTangent.w;
	return mat3(tangent, bitangent, normal);
}

mat3 BuildTangentSpace(const mat3 modelTransform, const vec3 normal, const vec4 signedTangent)
{
	vec3 tangent = signedTangent.xyz;
	vec3 bitangent = cross(normal, tangent) * signedTangent.w;
	return mat3(transpose(modelTransform) * tangent,
		transpose(modelTransform) * bitangent,
		transpose(modelTransform) * normal);
}

void BuildTangentSpace(const mat3 modelTransform, const vec3 normal, const vec4 signedTangent, out vec3 worldTangent, out vec3 worldBitangent)
{
	vec3 tangent = signedTangent.xyz;
	vec3 bitangent = cross(normal, tangent) * signedTangent.w;
	worldTangent = transpose(modelTransform) * tangent;
	worldBitangent = transpose(modelTransform) * bitangent;
}


uniform mat4 g_ModelViewProjectionMatrix;
uniform vec4 g_Texture0Rotation;
uniform vec2 g_Texture0Translation;


in vec3 a_Position;
in vec2 a_TexCoord;


out vec2 v_TexCoord;







void main() {

	vec3 localPos = a_Position;


	v_TexCoord.xy = a_TexCoord;



	// Prepare lighting data
	gl_Position = transpose(g_ModelViewProjectionMatrix) * vec4(localPos, 1.0);



}
