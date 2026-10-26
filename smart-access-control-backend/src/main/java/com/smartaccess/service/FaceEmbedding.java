package com.smartaccess.service;

import org.springframework.web.server.ResponseStatusException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

/** Lưu vector float32 đã chuẩn hóa theo little-endian; không lưu ảnh. */
public final class FaceEmbedding {
    public static final String MODEL = "buffalo_l/w600k_r50:v1";
    public static final int DIMENSIONS = 512;
    private FaceEmbedding() { }

    public static byte[] encode(String model, List<Float> values) {
        if (!MODEL.equals(model) || values == null || values.size() != DIMENSIONS)
            throw new ResponseStatusException(BAD_REQUEST, "Model khuôn mặt hoặc số chiều vector không được hỗ trợ.");
        double squared = 0;
        for (Float value : values) {
            if (value == null || !Float.isFinite(value))
                throw new ResponseStatusException(BAD_REQUEST, "Vector khuôn mặt phải chứa các số hữu hạn.");
            squared += (double) value * value;
        }
        if (squared < 1e-12 || !Double.isFinite(squared))
            throw new ResponseStatusException(BAD_REQUEST, "Vector khuôn mặt không có độ dài hợp lệ.");
        double norm = Math.sqrt(squared);
        ByteBuffer buffer = ByteBuffer.allocate(DIMENSIONS * Float.BYTES).order(ByteOrder.LITTLE_ENDIAN);
        for (float value : values) buffer.putFloat((float) (value / norm));
        return buffer.array();
    }

    public static List<Float> decode(byte[] bytes) {
        if (bytes == null || bytes.length != DIMENSIONS * Float.BYTES)
            throw new IllegalStateException("Vector khuôn mặt đã lưu không hợp lệ.");
        ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        List<Float> result = new ArrayList<>(DIMENSIONS);
        while (buffer.hasRemaining()) {
            float value = buffer.getFloat();
            if (!Float.isFinite(value)) throw new IllegalStateException("Vector khuôn mặt đã lưu không hợp lệ.");
            result.add(value);
        }
        return result;
    }
}
