package agentconfig

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
)

// Derive known keys from the wire tags so omitted optional fields cannot be
// overwritten by an extension and new schema fields need only one declaration.
func jsonFieldNames(known interface{}) map[string]bool {
	fields := reflect.Indirect(reflect.ValueOf(known)).Type()
	names := make(map[string]bool, fields.NumField())
	for index := 0; index < fields.NumField(); index++ {
		name := strings.Split(fields.Field(index).Tag.Get("json"), ",")[0]
		if name != "-" && name != "" {
			names[name] = true
		}
	}
	return names
}

func marshalUnknownFields(known interface{}, extra map[string]json.RawMessage) ([]byte, error) {
	encoded, err := json.Marshal(known)
	if err != nil {
		return nil, err
	}
	if len(extra) == 0 {
		return encoded, nil
	}
	var merged map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &merged); err != nil {
		return nil, err
	}
	knownNames := jsonFieldNames(known)
	for name, extension := range extra {
		if knownNames[name] {
			return nil, fmt.Errorf("extension cannot overwrite declared field %q", name)
		}
		merged[name] = extension
	}
	return json.Marshal(merged)
}

func unmarshalUnknownFields(raw []byte, known interface{}, extra *map[string]json.RawMessage) error {
	var unknown map[string]json.RawMessage
	if err := json.Unmarshal(raw, &unknown); err != nil {
		return err
	}
	declared := make(map[string]json.RawMessage)
	for name := range jsonFieldNames(known) {
		if field, exists := unknown[name]; exists {
			declared[name] = field
			delete(unknown, name)
		}
	}
	// encoding/json otherwise matches keys without case sensitivity, consuming
	// extensions such as "apikey" and overwriting the declared "apiKey".
	encoded, err := json.Marshal(declared)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(encoded, known); err != nil {
		return err
	}
	*extra = unknown
	return nil
}

func (entry McpEntryPublic) MarshalJSON() ([]byte, error) {
	type fields McpEntryPublic
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *McpEntryPublic) UnmarshalJSON(raw []byte) error {
	type fields McpEntryPublic
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry ModelEntryPublic) MarshalJSON() ([]byte, error) {
	type fields ModelEntryPublic
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *ModelEntryPublic) UnmarshalJSON(raw []byte) error {
	type fields ModelEntryPublic
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry SkillEntryPublic) MarshalJSON() ([]byte, error) {
	type fields SkillEntryPublic
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *SkillEntryPublic) UnmarshalJSON(raw []byte) error {
	type fields SkillEntryPublic
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry PromptEntryPublic) MarshalJSON() ([]byte, error) {
	type fields PromptEntryPublic
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *PromptEntryPublic) UnmarshalJSON(raw []byte) error {
	type fields PromptEntryPublic
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry AgentEntryPublic) MarshalJSON() ([]byte, error) {
	type fields AgentEntryPublic
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *AgentEntryPublic) UnmarshalJSON(raw []byte) error {
	type fields AgentEntryPublic
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry ResourceEntryPublic) MarshalJSON() ([]byte, error) {
	type fields ResourceEntryPublic
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *ResourceEntryPublic) UnmarshalJSON(raw []byte) error {
	type fields ResourceEntryPublic
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry BundlePublic) MarshalJSON() ([]byte, error) {
	type fields BundlePublic
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *BundlePublic) UnmarshalJSON(raw []byte) error {
	type fields BundlePublic
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry OAuthCredential) MarshalJSON() ([]byte, error) {
	type fields OAuthCredential
	return marshalUnknownFields(fields(entry), entry.UnknownFields)
}

func (entry *OAuthCredential) UnmarshalJSON(raw []byte) error {
	type fields OAuthCredential
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.UnknownFields)
}

func (entry ProviderSecret) MarshalJSON() ([]byte, error) {
	type fields ProviderSecret
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *ProviderSecret) UnmarshalJSON(raw []byte) error {
	type fields ProviderSecret
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry ProviderHint) MarshalJSON() ([]byte, error) {
	type fields ProviderHint
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *ProviderHint) UnmarshalJSON(raw []byte) error {
	type fields ProviderHint
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry BundleSecret) MarshalJSON() ([]byte, error) {
	type fields BundleSecret
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *BundleSecret) UnmarshalJSON(raw []byte) error {
	type fields BundleSecret
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry EncryptionPayload) MarshalJSON() ([]byte, error) {
	type fields EncryptionPayload
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *EncryptionPayload) UnmarshalJSON(raw []byte) error {
	type fields EncryptionPayload
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}

func (entry ConfigBundle) MarshalJSON() ([]byte, error) {
	type fields ConfigBundle
	return marshalUnknownFields(fields(entry), entry.Extra)
}

func (entry *ConfigBundle) UnmarshalJSON(raw []byte) error {
	type fields ConfigBundle
	return unmarshalUnknownFields(raw, (*fields)(entry), &entry.Extra)
}
