"""Public, bounded reasons for rejecting enrollment media; no internal exception details."""
MESSAGES = {
    'MEDIA_INVALID': 'Không đọc được ảnh/video. Chọn lại ảnh JPEG/PNG rõ mặt hoặc video tối đa 10 giây.',
    'IMAGE_TOO_LARGE': 'Ảnh sau xử lý vượt quá 5 MiB. Chọn ảnh nhỏ hơn hoặc chụp ảnh mới.',
    'IMAGE_DIMENSIONS': 'Ảnh vượt quá 20 megapixel. Giảm kích thước ảnh rồi thử lại.',
    'IMAGE_FORMAT': 'Không đọc được ảnh. Chọn JPEG/PNG hoặc chụp ảnh mới.',
    'NO_FACE': 'Không tìm thấy khuôn mặt trong ảnh. Chọn ảnh chính diện, đủ sáng và thấy rõ toàn bộ mặt.',
    'MULTIPLE_FACES': 'Ảnh có nhiều khuôn mặt. Chọn ảnh chỉ có một người.',
    'FACE_OUT_OF_FRAME': 'Khuôn mặt bị cắt sát mép ảnh. Chọn ảnh thấy toàn bộ khuôn mặt.',
    'FACE_TOO_SMALL': 'Khuôn mặt quá nhỏ trong ảnh. Chụp gần hơn để thấy rõ mặt.',
    'FACE_BLURRY': 'Ảnh khuôn mặt bị mờ. Chọn ảnh rõ nét hơn hoặc chụp lại đủ sáng.',
    'VIDEO_INVALID': 'Video cần dài tối đa 10 giây, độ phân giải tối đa 4K và có ít nhất 3 khung hình.',
    'VIDEO_READ_FAILED': 'Không đọc được video. Chọn MP4 hoặc tải ảnh rõ mặt.',
    'VIDEO_DIFFERENT_PEOPLE': 'Video phải chỉ có cùng một người xuyên suốt.',
}


class MediaValidationError(ValueError):
    def __init__(self, code):
        self.code = code if code in MESSAGES else 'MEDIA_INVALID'
        super().__init__(MESSAGES[self.code])
