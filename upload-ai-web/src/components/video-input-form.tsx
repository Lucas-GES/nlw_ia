import { FileVideo, Upload } from "lucide-react";
import { Separator } from "./ui/separator";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { getFFmpeg } from "@/lib/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { api } from "@/lib/axios";

type Status = 'waiting' | 'converting' | 'uploading' | 'generating' | 'success'

const statusMessages = {
    converting: 'Convertendo...',
    generating: 'Transcrevendo...',
    uploading: 'Carregando...',
    success: 'Sucesso!'
}

interface VideoInputFormProps {
    onVideoUploaded: (id: string) => void
}

export function VideoInputForm(props: VideoInputFormProps) {

    const ffmpegRef = useRef(new FFmpeg)

    const [loaded, setLoaded] = useState(false);

    const [status, setStatus] = useState<Status>('waiting')

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.2/dist/esm'

    const [videoFile, setVideoFile] = useState<File | null>(null);

    const promptInputRef = useRef<HTMLTextAreaElement>(null)



    function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
        const { files } = event.currentTarget

        if (!files) {
            return
        }

        const selectedFiles = files[0]

        setVideoFile(selectedFiles)
    }

    async function convertVideoToAudio(video: File) {
        console.log('Convert started.')

        const ffmpeg = ffmpegRef.current

        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        setLoaded(true);

        await ffmpeg.writeFile('input.mp4', await fetchFile(video))

        // ffmpeg.on('log', log => {
        //     console.log(log)
        // })

        ffmpeg.on('progress', progress => {
            console.log('Convert progress: ' + Math.round(progress.progress * 100))
        })

        await ffmpeg.exec([
            '-i',
            'input.mp4',
            '-map',
            '0:a',
            '-b:a',
            '20k',
            '-acodec',
            'libmp3lame',
            'output.mp3'
        ])

        const data = await ffmpeg.readFile('output.mp3')

        const audioFileBlob = new Blob([data], { type: 'audio/file' })
        const audioFile = new File([audioFileBlob], 'audio.mp3', {
            type: 'audio/mpeg',
        })

        console.log('Convert finished.')

        return audioFile
    }

    async function handeUploadVideo(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const prompt = promptInputRef.current?.value

        if (!videoFile) {
            return
        }

        setStatus('converting')

        const audioFile = await convertVideoToAudio(videoFile)

        const data = new FormData()

        data.append('file', audioFile)

        setStatus('uploading')

        const response = await api.post('/videos', data)

        const videoId = response.data.video.id

        setStatus('generating')

        await api.post(`videos/${videoId}/transcription`, {
            prompt,
        })

        setStatus('success')

        props.onVideoUploaded(videoId)
    }

    const previewURL = useMemo(() => {
        if (!videoFile) {
            return null
        }

        return URL.createObjectURL(videoFile)
    }, [videoFile])

    return (
        <form onSubmit={handeUploadVideo} className='space-y-6'>
            <label htmlFor="video" className='relative border flex rounded-md aspect-video cursor-pointer border-dashed text-sm flex-col gap-2 items-center justify-center text-muted-foreground hover:bg-primary/5'>
                {previewURL ? (
                    <video src={previewURL} controls={false} className="pointer-events-none absolute inset-0" />
                ) : (
                    <>
                        <FileVideo className='w-4 h-4' />
                        Selecione um video
                    </>
                )}
            </label>
            <input type="file" id='video' accept='video/mp4' className='sr-only' onChange={handleFileSelected} />

            <Separator />

            <div className='space-y-2'>
                <Label htmlFor='transcription_prompt'>Prompt de transcrição</Label>
                <Textarea ref={promptInputRef}
                    disabled={status !== 'waiting'}
                    id='transcription_prompt' className='h-20 leading-relaxed resize-none' placeholder='Inclua palavras-chave mencionadas no video separadas por vírgula (,)' />
            </div>
            <Button disabled={status !== 'waiting'} type='submit' className='w-full'>
                {status === 'waiting' ? (
                    <>
                        Carregar video
                        <Upload className='w-4 h-4 ml-2' />
                    </>
                ) : statusMessages[status]}
            </Button>
        </form>
    )
}