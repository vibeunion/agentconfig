package agentconfig

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"regexp"
)

const (
	SaltBytes   = 16
	IVBytes     = 12
	KeyBytes    = 32
	GCMTagBytes = 16
)

var (
	base64Pattern    = regexp.MustCompile(`^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$`)
	base64URLPattern = regexp.MustCompile(`^[A-Za-z0-9_-]*$`)
)

func validatePassword(password string) error {
	if len(password) == 0 {
		return errors.New("password must not be empty")
	}
	return nil
}

func validateIterations(iterations int) error {
	if iterations < PBKDF2MinIterations || iterations > PBKDF2MaxIterations {
		return fmt.Errorf("PBKDF2 iterations must be between %d and %d", PBKDF2MinIterations, PBKDF2MaxIterations)
	}
	return nil
}

func toB64(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

func fromB64(value string, fieldName string) ([]byte, error) {
	if !base64Pattern.MatchString(value) {
		return nil, fmt.Errorf("invalid %s", fieldName)
	}
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("invalid %s: %w", fieldName, err)
	}
	if toB64(decoded) != value {
		return nil, fmt.Errorf("non-canonical %s", fieldName)
	}
	return decoded, nil
}

func toB64URL(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func fromB64URL(value string) ([]byte, error) {
	if !base64URLPattern.MatchString(value) || len(value)%4 == 1 {
		return nil, errors.New("invalid bundle base64url payload")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("invalid base64url payload: %w", err)
	}
	if toB64URL(decoded) != value {
		return nil, errors.New("non-canonical bundle base64url payload")
	}
	return decoded, nil
}

func derivePBKDF2SHA256Key(password, salt []byte, iter, keyLen int) []byte {
	numBlocks := (keyLen + sha256.Size - 1) / sha256.Size
	var key []byte
	var blockNum [4]byte

	for i := 1; i <= numBlocks; i++ {
		binary.BigEndian.PutUint32(blockNum[:], uint32(i))

		mac := hmac.New(sha256.New, password)
		mac.Write(salt)
		mac.Write(blockNum[:])
		u := mac.Sum(nil)

		block := make([]byte, len(u))
		copy(block, u)

		for j := 1; j < iter; j++ {
			mac.Reset()
			mac.Write(u)
			u = mac.Sum(nil)
			for k := range block {
				block[k] ^= u[k]
			}
		}

		key = append(key, block...)
	}

	return key[:keyLen]
}

type EncryptResult struct {
	Salt       string
	IV         string
	CT         string
	Iterations int
}

func EncryptWithPassword(plaintext, password string, iterations int) (*EncryptResult, error) {
	if err := validatePassword(password); err != nil {
		return nil, err
	}
	if err := validateIterations(iterations); err != nil {
		return nil, err
	}

	salt := make([]byte, SaltBytes)
	if _, err := rand.Read(salt); err != nil {
		return nil, fmt.Errorf("failed to generate random salt: %w", err)
	}

	iv := make([]byte, IVBytes)
	if _, err := rand.Read(iv); err != nil {
		return nil, fmt.Errorf("failed to generate random iv: %w", err)
	}

	key := derivePBKDF2SHA256Key([]byte(password), salt, iterations, KeyBytes)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create gcm: %w", err)
	}

	ct := aesgcm.Seal(nil, iv, []byte(plaintext), nil)

	return &EncryptResult{
		Salt:       toB64(salt),
		IV:         toB64(iv),
		CT:         toB64(ct),
		Iterations: iterations,
	}, nil
}

func DecryptWithPassword(saltB64, ivB64, ctB64 string, iterations int, password string) (string, error) {
	if err := validatePassword(password); err != nil {
		return "", err
	}
	if err := validateIterations(iterations); err != nil {
		return "", err
	}

	salt, err := fromB64(saltB64, "salt")
	if err != nil {
		return "", err
	}
	if len(salt) != SaltBytes {
		return "", fmt.Errorf("invalid salt length: expected %d bytes, got %d", SaltBytes, len(salt))
	}

	iv, err := fromB64(ivB64, "IV")
	if err != nil {
		return "", err
	}
	if len(iv) != IVBytes {
		return "", fmt.Errorf("invalid IV length: expected %d bytes, got %d", IVBytes, len(iv))
	}

	ct, err := fromB64(ctB64, "ciphertext")
	if err != nil {
		return "", err
	}
	if len(ct) < GCMTagBytes {
		return "", errors.New("ciphertext too short (missing GCM tag)")
	}

	key := derivePBKDF2SHA256Key([]byte(password), salt, iterations, KeyBytes)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create gcm: %w", err)
	}

	plaintext, err := aesgcm.Open(nil, iv, ct, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed: %w", err)
	}

	return string(plaintext), nil
}
