export default function handler(
  req: any,
  res: any
) {
  return res.status(200).json({
    status: "ok",
    message: "Vercel funcionando",
    timestamp: new Date().toISOString()
  });
}
