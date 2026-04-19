"""
测试框架 - KeyShield v2-MVP

运行方式：
  python -m pytest tests/

单独运行某个测试：
  python -m pytest tests/test_layer2_proxy.py::test_health_check -v
"""

import pytest
from fastapi.testclient import TestClient
import os
import sys

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ============ Layer 2 Proxy Tests ============


class TestLayer2Proxy:
    """代理转发测试"""

    @pytest.fixture
    def client(self):
        """创建测试客户端"""
        from layer2_proxy.proxy import app
        return TestClient(app)

    def test_health_check(self, client):
        """测试健康检查端点"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_health_check_response_format(self, client):
        """测试健康检查响应格式"""
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert "service" in data
        assert data["service"] == "keyshield-layer2-proxy"


# ============ Layer 1 Crypto Tests ============


class TestLayer1Crypto:
    """密钥加密测试"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """设置测试环境"""
        os.environ["KEYSHIELD_MASTER_KEY"] = "BQa7h9PvBxxZ91XpU3C1NZv7z8XY5f4qj2mK0pR6sT8="

    def test_encrypt_decrypt(self):
        """测试加密/解密"""
        from layer1_key_management.crypto import encrypt_key, decrypt_key

        plaintext = "test-api-key-123"
        user_id = "user_001"

        encrypted = encrypt_key(plaintext, user_id)
        decrypted = decrypt_key(encrypted, user_id)

        assert decrypted == plaintext
        assert encrypted != plaintext  # 确实被加密了

    def test_different_users_different_encryption(self):
        """测试不同用户的加密密钥不同"""
        from layer1_key_management.crypto import encrypt_key

        plaintext = "same-api-key"
        user1_encrypted = encrypt_key(plaintext, "user_001")
        user2_encrypted = encrypt_key(plaintext, "user_002")

        # 不同用户应该生成不同的密文
        assert user1_encrypted != user2_encrypted

    def test_wrong_user_cannot_decrypt(self):
        """测试用户 B 无法解密用户 A 的密钥"""
        from layer1_key_management.crypto import encrypt_key, decrypt_key
        from cryptography.fernet import InvalidToken

        plaintext = "secret-key"
        encrypted = encrypt_key(plaintext, "user_001")

        # 尝试用其他用户的 ID 解密应该失败
        with pytest.raises(InvalidToken):
            decrypt_key(encrypted, "user_002")


# ============ 集成测试 ============


class TestIntegration:
    """集成测试（多个模块协作）"""

    @pytest.fixture
    def client(self):
        """创建测试客户端"""
        from layer2_proxy.proxy import app
        return TestClient(app)

    @pytest.fixture(autouse=True)
    def setup(self):
        """设置环境"""
        os.environ["HELIUS_API_KEY"] = "test-key"
        os.environ["KEYSHIELD_MASTER_KEY"] = "BQa7h9PvBxxZ91XpU3C1NZv7z8XY5f4qj2mK0pR6sT8="

    def test_placeholder(self):
        """占位符：第三阶段集成测试"""
        pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
