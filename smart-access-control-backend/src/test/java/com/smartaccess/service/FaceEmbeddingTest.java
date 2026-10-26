package com.smartaccess.service;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class FaceEmbeddingTest {
    @Test
    void normalizesAndRejectsUnusableOrIncompatibleVectors() {
        List<Float> vector = new ArrayList<>(Collections.nCopies(512, 0f)); vector.set(0, 3f); vector.set(1, 4f);
        var decoded = FaceEmbedding.decode(FaceEmbedding.encode(FaceEmbedding.MODEL, vector));
        assertThat(decoded.get(0)).isCloseTo(0.6f, within(0.0001f));
        assertThat(decoded.get(1)).isCloseTo(0.8f, within(0.0001f));
        vector.set(0, Float.NaN);
        assertThatThrownBy(() -> FaceEmbedding.encode(FaceEmbedding.MODEL, vector)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> FaceEmbedding.encode(FaceEmbedding.MODEL, Collections.nCopies(512, 0f))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> FaceEmbedding.encode("other-model", Collections.nCopies(512, 1f))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> FaceEmbedding.encode(FaceEmbedding.MODEL, List.of(1f))).isInstanceOf(ResponseStatusException.class);
    }
}
