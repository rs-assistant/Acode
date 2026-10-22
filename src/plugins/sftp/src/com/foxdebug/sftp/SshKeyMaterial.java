package com.foxdebug.sftp;

import com.sshtools.common.publickey.SshKeyPairGenerator;
import com.sshtools.common.publickey.SshPrivateKeyFileFactory;
import com.sshtools.common.publickey.SshPublicKeyFileFactory;
import com.sshtools.common.ssh.components.SshKeyPair;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;

/** Native-only material. Never serialize this object into a Cordova result. */
final class SshKeyMaterial implements AutoCloseable {
  final byte[] privateKey;
  final String publicKey;
  final String fingerprint;
  final String algorithm;

  private SshKeyMaterial(byte[] privateKey, String publicKey, String fingerprint, String algorithm) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.fingerprint = fingerprint;
    this.algorithm = algorithm;
  }

  static SshKeyMaterial generate(String algorithm) throws Exception {
    if (!"ed25519".equals(algorithm) && !"rsa4096".equals(algorithm)) {
      throw new IllegalArgumentException("Unsupported SSH key algorithm");
    }
    SshKeyPair pair = "ed25519".equals(algorithm)
      ? SshKeyPairGenerator.generateKeyPair(SshKeyPairGenerator.ED25519)
      : SshKeyPairGenerator.generateKeyPair(SshKeyPairGenerator.SSH2_RSA, 4096);
    byte[] encoded = SshPrivateKeyFileFactory.create(pair, "", "acode",
      SshPrivateKeyFileFactory.OPENSSH_FORMAT).getFormattedKey();
    try {
      String publicKey = new String(SshPublicKeyFileFactory.create(pair.getPublicKey(),
        "acode", SshPublicKeyFileFactory.OPENSSH_FORMAT).getFormattedKey(),
        StandardCharsets.UTF_8).trim();
      String fingerprint = "SHA256:" + Base64.getEncoder().withoutPadding().encodeToString(
        MessageDigest.getInstance("SHA-256").digest(pair.getPublicKey().getEncoded()));
      // Refuse a serialization that cannot be read back by the actual SSH stack.
      SshKeyPair restored = SshPrivateKeyFileFactory.parse(encoded).toKeyPair("");
      if (!Arrays.equals(pair.getPublicKey().getEncoded(), restored.getPublicKey().getEncoded())) {
        throw new IllegalStateException("Generated SSH key validation failed");
      }
      return new SshKeyMaterial(encoded, publicKey, fingerprint, algorithm);
    } catch (Exception error) {
      Arrays.fill(encoded, (byte) 0);
      throw error;
    }
  }

  @Override public void close() { Arrays.fill(privateKey, (byte) 0); }
}
